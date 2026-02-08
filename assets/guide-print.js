(function () {
  'use strict';

  const btn = document.getElementById('print-guide');
  if (!btn) {return;}

  btn.addEventListener('click', function () {
    window.print();
  });
})();
