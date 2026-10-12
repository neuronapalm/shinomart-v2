const toggle = document.querySelector('.menu-toggle');
const menu = document.querySelector('.mobile-nav');

function setMenu(open) {
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
  menu.hidden = !open;
  document.body.classList.toggle('menu-open', open);
}

toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
menu.addEventListener('click', event => {
  if (event.target.closest('a')) setMenu(false);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !menu.hidden) {
    setMenu(false);
    toggle.focus();
  }
});
document.addEventListener('click', event => {
  if (!menu.hidden && !event.target.closest('.site-header')) setMenu(false);
});
window.matchMedia('(min-width: 981px)').addEventListener('change', event => {
  if (event.matches) setMenu(false);
});
