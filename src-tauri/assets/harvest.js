// X for Windows — injected at document start, after Control Panel for Twitter.
// Adds a media download button to every tweet (Media Harvest style) and
// hides promoted posts. Downloads are performed by the Rust `download_media`
// command, which saves to Downloads/twitter_media_harvest/ with the filename
// pattern {accountId}-{tweetId}-{serial}-{downloadDate}.
(function () {
  'use strict';
  var host = location.hostname;
  if (!/(^|\.)x\.com$/.test(host) && !/(^|\.)twitter\.com$/.test(host)) return;
  if (window.__xHarvestInstalled) return;
  window.__xHarvestInstalled = true;

  var mediaByTweet = new Map();

  function extOf(u, fallback) {
    var m = /\.([a-zA-Z0-9]+)(\?|$)/.exec(u || '');
    return m ? m[1].toLowerCase() : fallback;
  }

  function mediaItems(tweet) {
    var legacy = tweet.legacy || {};
    var media =
      (legacy.extended_entities && legacy.extended_entities.media) ||
      (legacy.entities && legacy.entities.media) ||
      [];
    var items = [];
    media.forEach(function (m) {
      if (m.type === 'photo' && m.media_url_https) {
        var u = m.media_url_https;
        items.push({
          url: u + (u.indexOf('?') >= 0 ? '&' : '?') + 'name=orig',
          ext: extOf(u, 'jpg'),
        });
      } else if (
        (m.type === 'video' || m.type === 'animated_gif') &&
        m.video_info &&
        m.video_info.variants
      ) {
        var mp4s = m.video_info.variants.filter(function (v) {
          return v.content_type === 'video/mp4';
        });
        mp4s.sort(function (a, b) {
          return (b.bitrate || 0) - (a.bitrate || 0);
        });
        if (mp4s.length) items.push({ url: mp4s[0].url, ext: 'mp4' });
      }
    });
    return items;
  }

  function walk(node, depth) {
    if (!node || typeof node !== 'object' || depth > 80) return;
    if (
      !Array.isArray(node) &&
      node.rest_id &&
      node.legacy &&
      ((node.legacy.extended_entities && node.legacy.extended_entities.media) ||
        (node.legacy.entities && node.legacy.entities.media))
    ) {
      var items = mediaItems(node);
      if (items.length) {
        var user =
          node.core && node.core.user_results && node.core.user_results.result;
        mediaByTweet.set(String(node.rest_id), {
          accountId: user && user.rest_id ? String(user.rest_id) : '',
          screenName:
            user && user.legacy && user.legacy.screen_name
              ? user.legacy.screen_name
              : '',
          items: items,
        });
      }
    }
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) walk(node[i], depth + 1);
    } else {
      for (var k in node) {
        if (Object.prototype.hasOwnProperty.call(node, k)) {
          walk(node[k], depth + 1);
        }
      }
    }
  }

  function harvestJson(json) {
    try {
      walk(json, 0);
    } catch (e) {}
  }

  function isApiUrl(u) {
    u = String(u || '');
    return u.indexOf('/i/api/') >= 0 || u.indexOf('api.x.com') >= 0;
  }

  // Watch fetch() responses for tweet media data.
  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function () {
      return origFetch.apply(this, arguments).then(function (resp) {
        try {
          if (isApiUrl(resp.url)) {
            resp
              .clone()
              .json()
              .then(harvestJson)
              .catch(function () {});
          }
        } catch (e) {}
        return resp;
      });
    };
  }

  // Watch XHR responses (X's web client mostly uses XHR).
  var origOpen = XMLHttpRequest.prototype.open;
  var origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__xUrl = url;
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    var xhr = this;
    this.addEventListener('load', function () {
      try {
        if (isApiUrl(xhr.__xUrl || xhr.responseURL)) {
          if (xhr.responseType === '' || xhr.responseType === 'text') {
            harvestJson(JSON.parse(xhr.responseText));
          } else if (xhr.responseType === 'json' && xhr.response) {
            harvestJson(xhr.response);
          }
        }
      } catch (e) {}
    });
    return origSend.apply(this, arguments);
  };

  function invokeDownload(payload) {
    var inv =
      (window.__TAURI__ &&
        window.__TAURI__.core &&
        window.__TAURI__.core.invoke) ||
      (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke);
    if (!inv) return Promise.reject(new Error('no-ipc'));
    return inv('download_media', payload);
  }

  function toast(msg) {
    var el = document.getElementById('__xdl_toast');
    if (!el) {
      el = document.createElement('div');
      el.id = '__xdl_toast';
      el.style.cssText =
        'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);' +
        'background:rgb(29,155,240);color:#fff;padding:10px 18px;' +
        'border-radius:9999px;font-size:14px;z-index:99999;' +
        'box-shadow:0 4px 16px rgba(0,0,0,0.3);transition:opacity .3s;' +
        'pointer-events:none;font-family:sans-serif;';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(el.__t);
    el.__t = setTimeout(function () {
      el.style.opacity = '0';
    }, 2600);
  }

  function localDate() {
    var d = new Date();
    function p(n) {
      return String(n).padStart(2, '0');
    }
    return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
  }

  var DL_ICON =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">' +
    '<path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>';

  function tweetIdOf(article) {
    var links = article.querySelectorAll('a[href*="/status/"]');
    for (var i = 0; i < links.length; i++) {
      var m = /\/status\/(\d+)/.exec(links[i].getAttribute('href') || '');
      if (m) return m[1];
    }
    return null;
  }

  function screenNameOf(article) {
    var a = article.querySelector('a[href*="/status/"]');
    if (!a) return '';
    var parts = (a.getAttribute('href') || '').split('/');
    return parts.length > 1 ? parts[1] : '';
  }

  function domFallbackItems(article) {
    var items = [];
    article
      .querySelectorAll('img[src*="pbs.twimg.com/media/"]')
      .forEach(function (img) {
        var src = (img.getAttribute('src') || '').split('?')[0];
        if (src) items.push({ url: src + '?name=orig', ext: extOf(src, 'jpg') });
      });
    return items;
  }

  function addButton(article, tweetId) {
    var group = article.querySelector('div[role="group"]');
    if (!group || group.querySelector('[data-xdl]')) return;
    var data = mediaByTweet.get(tweetId);
    var items = data ? data.items : domFallbackItems(article);
    if (!items.length) return;
    var btn = document.createElement('button');
    btn.setAttribute('data-xdl', '1');
    btn.type = 'button';
    btn.title = 'メディアを保存';
    btn.innerHTML = DL_ICON;
    btn.style.cssText =
      'background:none;border:none;cursor:pointer;color:rgb(113,118,123);' +
      'display:flex;align-items:center;justify-content:center;' +
      'width:34px;height:34px;border-radius:9999px;padding:0;flex:none;';
    btn.addEventListener('mouseenter', function () {
      btn.style.background = 'rgba(29,155,240,0.1)';
      btn.style.color = 'rgb(29,155,240)';
    });
    btn.addEventListener('mouseleave', function () {
      btn.style.background = 'none';
      btn.style.color = 'rgb(113,118,123)';
    });
    btn.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      var d = mediaByTweet.get(tweetId);
      var list = d ? d.items : items;
      var accountId = d ? d.accountId : '';
      var screenName = d ? d.screenName : screenNameOf(article);
      btn.style.opacity = '0.4';
      btn.style.pointerEvents = 'none';
      var jobs = list.map(function (it, i) {
        return invokeDownload({
          url: it.url,
          accountId: accountId,
          screenName: screenName,
          tweetId: tweetId,
          serial: i + 1,
          date: localDate(),
          ext: it.ext,
        });
      });
      Promise.all(jobs)
        .then(function () {
          toast('保存しました（' + list.length + '件）');
        })
        .catch(function () {
          toast('保存に失敗しました');
        })
        .finally(function () {
          btn.style.opacity = '';
          btn.style.pointerEvents = '';
        });
    });
    group.appendChild(btn);
  }

  var AD_LABELS = ['プロモーション', 'Promoted', '広告', 'Ad'];
  function hideAds(article) {
    var spans = article.querySelectorAll('span');
    for (var i = 0; i < spans.length; i++) {
      if (AD_LABELS.indexOf(spans[i].textContent.trim()) >= 0) {
        var cell = article.closest('[data-testid="cellInnerDiv"]') || article;
        cell.style.display = 'none';
        return;
      }
    }
  }

  function scan() {
    document
      .querySelectorAll('article[data-testid="tweet"]')
      .forEach(function (article) {
        hideAds(article);
        var id = tweetIdOf(article);
        if (id) addButton(article, id);
      });
  }

  var pending = false;
  function scheduleScan() {
    if (pending) return;
    pending = true;
    setTimeout(function () {
      pending = false;
      scan();
    }, 400);
  }

  function start() {
    scan();
    new MutationObserver(scheduleScan).observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
