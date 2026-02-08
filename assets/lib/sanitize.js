(function () {
  'use strict';

  function containsHtmlTags(value) {
    return /<\/?[a-z][^>]*>/i.test(String(value || ''));
  }

  function stripHtmlTags(value) {
    return String(value || '').replace(/<\/?[a-z][^>]*>/gi, '').trim();
  }

  const api = { containsHtmlTags, stripHtmlTags };
  if (typeof window !== 'undefined') {
    window.PO_SANITIZE = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
