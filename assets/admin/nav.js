/* assets/admin/nav.js — Floating pill nav scroll behavior.
   Shared by all Admin Console pages.
   Expects: #navPill, #navScroller, #navLeft, #navRight in the DOM.
*/
(function () {
  var pill     = document.getElementById('navPill');
  var scroller = document.getElementById('navScroller');
  var btnLeft  = document.getElementById('navLeft');
  var btnRight = document.getElementById('navRight');
  if (!pill || !scroller) return;

  function updateFades() {
    var sl  = scroller.scrollLeft;
    var max = scroller.scrollWidth - scroller.clientWidth;
    pill.classList.toggle('fade-left',  sl > 4);
    pill.classList.toggle('fade-right', sl < max - 4);
  }

  scroller.addEventListener('scroll', updateFades, { passive: true });
  window.addEventListener('resize',  updateFades, { passive: true });
  if (btnLeft)  btnLeft.addEventListener('click',  function () { scroller.scrollBy({ left: -140, behavior: 'smooth' }); });
  if (btnRight) btnRight.addEventListener('click', function () { scroller.scrollBy({ left:  140, behavior: 'smooth' }); });

  // Scroll active item into view
  var active = scroller.querySelector('.is-active');
  if (active) active.scrollIntoView({ inline: 'center', block: 'nearest' });

  updateFades();
})();
