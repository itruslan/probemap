/**
 * Размеры «слотов» под текст при смене ru/en — модалки и CTA не дёргаются при смене языка.
 */
export const I18N_STABLE = {
  /** «Создать проект» / Create project и аналоги */
  ctaMinWidthPx: 212,
  /** «Открыть настройки» / Open settings */
  settingsOpenMinWidthPx: 220,
  /** Заголовок модалки «Новый проект» / New project */
  modalTitleMinHeightPx: 48,
  /** Вводный абзац в модалке проекта */
  projectIntroMinHeightPx: 80,
} as const;
