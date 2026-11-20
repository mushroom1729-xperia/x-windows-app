// X for Windows UI tweaks: old-Twitter wording, bird logo, share-domain rewrite.
// Config comes from window.__XW_CFG__ injected by the Rust side:
//   { replaceTerms: bool, replaceLogo: bool, shareDomain: string }
(function () {
  var cfg = window.__XW_CFG__ || {};
  var BIRD = 'M15.704 8.99c.457-.05.892-.17 1.296-.35-.302.45-.684.84-1.125 1.15.004.1.006.19.006.29 0 2.94-2.269 6.32-6.421 6.32-1.274 0-2.46-.37-3.459-1 .177.02.357.03.539.03 1.057 0 2.03-.35 2.803-.95-.988-.02-1.821-.66-2.109-1.54.138.03.28.04.425.04.206 0 .405-.03.595-.08-1.033-.2-1.811-1.1-1.811-2.18v-.03c.305.17.652.27 1.023.28-.606-.4-1.004-1.08-1.004-1.85 0-.4.111-.78.305-1.11 1.113 1.34 2.775 2.22 4.652 2.32-.038-.17-.058-.33-.058-.51 0-1.23 1.01-2.22 2.256-2.22.649 0 1.235.27 1.647.7.514-.1.997-.28 1.433-.54-.168.52-.526.96-.992 1.23z';

  // ---------- share / copy domain rewrite ----------
  if (cfg.shareDomain) {
    var dom = String(cfg.shareDomain)
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '');
    if (dom) {
      var rewrite = function (t) {
        if (typeof t !== 'string') return t;
        return t.replace(
          /https?:\/\/(www\.)?(x\.com|twitter\.com)\//g,
          'https://' + dom + '/'
        );
      };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          var origWT = navigator.clipboard.writeText.bind(navigator.clipboard);
          navigator.clipboard.writeText = function (t) {
            return origWT(rewrite(t));
          };
        }
        if (navigator.clipboard && navigator.clipboard.write && window.ClipboardItem) {
          var origW = navigator.clipboard.write.bind(navigator.clipboard);
          navigator.clipboard.write = function (items) {
            var rebuilt = items.map(function (item) {
              var data = {};
              item.types.forEach(function (type) {
                if (type === 'text/plain') {
                  data[type] = item
                    .getType(type)
                    .then(function (b) { return b.text(); })
                    .then(rewrite);
                } else {
                  data[type] = item.getType(type);
                }
              });
              return new ClipboardItem(data);
            });
            return origW(rebuilt);
          };
        }
      } catch (e) {}
      // Legacy path: the page selects a hidden field holding the URL and
      // runs execCommand('copy') — rewrite that selection as it is copied.
      document.addEventListener(
        'copy',
        function (e) {
          try {
            var sel = String(window.getSelection() || '').trim();
            if (/^https?:\/\/(www\.)?(x\.com|twitter\.com)\//.test(sel)) {
              var rw = rewrite(sel);
              if (rw !== sel && e.clipboardData) {
                e.preventDefault();
                e.clipboardData.setData('text/plain', rw);
              }
            }
          } catch (err) {}
        },
        true
      );
    }
  }

  // ---------- left sidebar item visibility ----------
  var NAV_SELECTORS = {
    home: ['header nav a[href="/home"]'],
    explore: ['header nav a[href="/explore"]'],
    notifications: ['header nav a[href="/notifications"]'],
    messages: ['header nav a[href="/messages"]', 'header nav a[href="/i/chat"]'],
    grok: ['header nav a[href="/i/grok"]'],
    lists: ['header nav a[href$="/lists"]'],
    bookmarks: ['header nav a[href="/bookmarks"]', 'header nav a[href="/i/bookmarks"]'],
    communities: ['header nav a[href$="/communities"]'],
    premium: ['header nav a[href="/premium"]', 'header nav a[href="/i/premium_sign_up"]'],
    more: ['header nav [data-testid="AppTabBar_More_Menu"]']
  };
  var KNOWN_NAV_HREFS = [
    '/home', '/explore', '/notifications', '/messages', '/i/chat',
    '/i/grok', '/bookmarks', '/i/bookmarks', '/premium',
    '/i/premium_sign_up', '/settings'
  ];
  function applyNavHiding() {
    var hide = cfg.navHide || [];
    if (!hide.length) return;
    var css = '';
    hide.forEach(function (key) {
      (NAV_SELECTORS[key] || []).forEach(function (sel) {
        css += sel + ' { display: none !important; }\n';
      });
    });
    if (css && !document.getElementById('xw-nav-style')) {
      var style = document.createElement('style');
      style.id = 'xw-nav-style';
      style.textContent = css;
      (document.head || document.documentElement).appendChild(style);
    }
    if (hide.indexOf('profile') >= 0) {
      // The profile link's href is /<username>, so find it by elimination.
      document
        .querySelectorAll('header nav a[href^="/"]')
        .forEach(function (a) {
          var href = a.getAttribute('href') || '';
          if (
            /^\/[A-Za-z0-9_]{1,30}$/.test(href) &&
            KNOWN_NAV_HREFS.indexOf(href) === -1 &&
            !/\/(lists|communities)$/.test(href)
          ) {
            a.style.setProperty('display', 'none', 'important');
          }
        });
    }
  }

  // ---------- bird logo (top-left) ----------
  function fixLogo(root) {
    if (!cfg.replaceLogo || !root || !root.querySelectorAll) return;
    var svgs = root.querySelectorAll(
      'h1 a[href="/home"] svg, header a[href="/home"] svg'
    );
    svgs.forEach(function (svg) {
      if (svg.closest('nav')) return; // not the sidebar Home link
      var cur = svg.querySelector('path');
      if (cur && cur.getAttribute('d') === BIRD) return;
      // Crop the viewBox around the bird so it renders larger.
      svg.setAttribute('viewBox', '3.7 5.8 15.6 12.4');
      svg.innerHTML =
        '<path fill="#1D9BF0" d="' + BIRD + '"></path>';
    });
  }

  // ---------- old Twitter home icon ----------
  var HOME_PATH =
    'M12 2.8 L22 10.6 L19.8 10.6 L19.8 21 L4.2 21 L4.2 10.6 L2 10.6 Z ' +
    'M9.2 21 L9.2 15.6 C9.2 14.2 10.4 13.2 12 13.2 C13.6 13.2 14.8 14.2 14.8 15.6 L14.8 21 Z';
  function fixHomeIcon() {
    if (!cfg.oldHomeIcon) return;
    var svg = document.querySelector('header nav a[href="/home"] svg');
    if (!svg) return;
    var cur = svg.querySelector('path');
    if (cur && cur.getAttribute('d') === HOME_PATH) return;
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.innerHTML =
      '<path fill="currentColor" fill-rule="evenodd" d="' + HOME_PATH + '"></path>';
  }

  // ---------- wording: post -> tweet ----------
  var RULES = [
    [/リポスト/g, 'リツイート'],
    [/ポスト/g, 'ツイート']
  ];
  function replText(t) {
    var out = t;
    for (var i = 0; i < RULES.length; i++) out = out.replace(RULES[i][0], RULES[i][1]);
    return out;
  }
  function skipEl(el) {
    if (!el || !el.closest) return true;
    return !!el.closest(
      '[contenteditable="true"], textarea, input, [data-testid^="tweetTextarea"]'
    );
  }
  function processTextNode(node) {
    if (!cfg.replaceTerms) return;
    var p = node.parentElement;
    if (!p || skipEl(p)) return;
    var v = node.nodeValue;
    if (!v || v.indexOf('ポスト') === -1) return;
    var nv = replText(v);
    if (nv !== v) node.nodeValue = nv;
  }
  function processAttrs(el) {
    if (!cfg.replaceTerms || !el.getAttribute || skipEl(el)) return;
    ['aria-label', 'title'].forEach(function (a) {
      var v = el.getAttribute(a);
      if (v && v.indexOf('ポスト') !== -1) el.setAttribute(a, replText(v));
    });
  }
  function processRoot(root) {
    if (!root) return;
    if (root.nodeType === 3) {
      processTextNode(root);
      return;
    }
    if (root.nodeType !== 1) return;
    processAttrs(root);
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var list = [];
    var n;
    while ((n = walker.nextNode())) list.push(n);
    list.forEach(processTextNode);
    if (root.querySelectorAll) {
      root.querySelectorAll('[aria-label], [title]').forEach(processAttrs);
    }
    fixLogo(root);
    fixHomeIcon();
    applyHideForYou();
  }

  var pending = [];
  var scheduled = false;
  function flush() {
    scheduled = false;
    var batch = pending;
    pending = [];
    batch.forEach(processRoot);
  }
  function queue(node) {
    pending.push(node);
    if (!scheduled) {
      scheduled = true;
      setTimeout(flush, 120);
    }
  }

  // ---------- fully hide the For You tab ----------
  // CPT's own CSS only shrinks the tab container on the current X layout;
  // hide the container outright and switch to the Following tab if needed.
  var lastTabSwitch = 0;
  function applyHideForYou() {
    if (!cfg.hideForYou) return;
    if (!document.getElementById('xw-foryou-style')) {
      var style = document.createElement('style');
      style.id = 'xw-foryou-style';
      style.textContent =
        'body.HomeTimeline nav.TimelineTabs div[role="tablist"] > div:first-child { display: none !important; }';
      (document.head || document.documentElement).appendChild(style);
    }
    var selected = document.querySelector(
      'nav.TimelineTabs div[role="tablist"] > div:first-child a[aria-selected="true"]'
    );
    if (selected && Date.now() - lastTabSwitch > 3000) {
      var following = document.querySelector(
        'nav.TimelineTabs div[role="tablist"] > div:nth-child(2) a'
      );
      if (following) {
        lastTabSwitch = Date.now();
        following.click();
      }
    }
  }

  function start() {
    applyNavHiding();
    applyHideForYou();
    processRoot(document.body || document.documentElement);
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'childList') {
          m.addedNodes.forEach(queue);
        } else if (m.type === 'characterData') {
          queue(m.target);
        } else if (m.type === 'attributes') {
          processAttrs(m.target);
        }
        if ((cfg.navHide || []).indexOf('profile') >= 0) applyNavHiding();
      }
    });
    mo.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-label', 'title']
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
