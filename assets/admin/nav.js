/* assets/admin/nav.js — Floating pill nav scroll behavior.
   Shared by all Admin Console pages.
   Expects: #navPill, #navScroller, #navLeft, #navRight in the DOM.
*/
(function () {
  const pill     = document.getElementById('navPill');
  const scroller = document.getElementById('navScroller');
  const btnLeft  = document.getElementById('navLeft');
  const btnRight = document.getElementById('navRight');
  if (!pill || !scroller) {return;}

  function updateFades() {
    const sl  = scroller.scrollLeft;
    const max = scroller.scrollWidth - scroller.clientWidth;
    pill.classList.toggle('fade-left',  sl > 4);
    pill.classList.toggle('fade-right', sl < max - 4);
  }

  scroller.addEventListener('scroll', updateFades, { passive: true });
  window.addEventListener('resize',  updateFades, { passive: true });
  if (btnLeft)  {btnLeft.addEventListener('click',  function () { scroller.scrollBy({ left: -140, behavior: 'smooth' }); });}
  if (btnRight) {btnRight.addEventListener('click', function () { scroller.scrollBy({ left:  140, behavior: 'smooth' }); });}

  // Scroll active item into view
  const active = scroller.querySelector('.is-active');
  if (active) {active.scrollIntoView({ inline: 'center', block: 'nearest' });}

  updateFades();
})();
