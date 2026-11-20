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
      } catch (e) {}
    }
  }

  // ---------- bird logo (top-left) ----------
  function fixLogo(root) {
    if (!cfg.replaceLogo || !root || !root.querySelectorAll) return;
    var svgs = root.querySelectorAll(
      'h1 a[href="/home"] svg, header a[href="/home"] svg'
    );
    svgs.forEach(function (svg) {
      if (svg.getAttribute('data-xw-logo')) return;
      svg.setAttribute('data-xw-logo', '1');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.innerHTML =
        '<path fill="#1D9BF0" d="' + BIRD + '"></path>';
    });
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

  function start() {
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
