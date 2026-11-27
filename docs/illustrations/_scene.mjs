/**
 * Screenshots for the README illustrations, taken from the browser demo (fictional demo data, no real account).
 * The demo follows the browser's language, so each language is captured on its own.
 *
 *   npx vite --port 5199
 *   SHOT_LANGUAGE=zh node <readme-illustrations skill>/scripts/capture.mjs docs/illustrations/_scene.mjs --out docs/illustrations/shots/zh
 *   SHOT_LANGUAGE=en node <readme-illustrations skill>/scripts/capture.mjs docs/illustrations/_scene.mjs --out docs/illustrations/shots/en
 *   node docs/illustrations/_pages.mjs
 *   node <readme-illustrations skill>/scripts/render.mjs docs/illustrations --out assets/illustrations
 */

export const url = 'http://localhost:5199/'
export const viewport = { width: 1440, height: 1080 }

const language = process.env.SHOT_LANGUAGE === 'en' ? 'en' : 'zh'
export const locale = { zh: 'zh-CN', en: 'en-US' }[language]

/** The demo's words the shots look for, from shared/strings/<language>/. */
const WORDS = {
  zh: {
    swipe: '刷卡，翻到背面看工位',
    failedBot: 'Bug 反馈整理',
    failure: '连不上 GitHub',
    miniApp: /收入汇总/,
    demoBanner: '演示模式',
  },
  en: {
    swipe: 'Swipe the badge to see the desk on the back',
    failedBot: 'Bug triage',
    failure: 'Could not reach GitHub',
    miniApp: /^Revenue/,
    demoBanner: 'Demo mode',
  },
}[language]

/** Opens one bot with the panel on one tab, in the theme capture.mjs asked the browser for. */
async function open(page, botId, panelTab) {
  await page.evaluate(
    ({ botId, panelTab }) => {
      const theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      const state = {
        preferences: { theme, isDebug: false },
        botId,
        panelOpen: true,
        panelTab,
        demoDisclaimerSeen: true,
      }
      for (const [key, value] of Object.entries(state))
        localStorage.setItem(`nengyongbot:${key}`, JSON.stringify(value))
    },
    { botId, panelTab },
  )
  await page.reload()
  await page.getByRole('button', { name: WORDS.swipe }).waitFor()
  // the illustrations show the app itself, not the banner that marks the browser demo
  await page.getByText(WORDS.demoBanner).evaluate((label) => {
    label.hidden = true
  })
}

export const shots = [
  { name: 'main', prepare: (page) => open(page, 'main', 'feed') },
  {
    name: 'tasks',
    async prepare(page) {
      await open(page, 'release', 'feed')
      await page.getByText(WORDS.failedBot, { exact: true }).first().hover()
      await page.getByText(WORDS.failure, { exact: false }).first().waitFor()
      // capture.mjs moves the mouse away before the shot; React's pointer leave comes from pointerout, so the card stays
      await page.evaluate(() =>
        window.addEventListener('pointerout', (event) => event.stopImmediatePropagation(), true),
      )
    },
  },
  { name: 'flows', prepare: (page) => open(page, 'release', 'flows') },
  {
    name: 'mini-app',
    async prepare(page) {
      await open(page, 'content', 'miniApps')
      await page.getByRole('main').getByRole('button', { name: WORDS.miniApp }).first().click()
      await page.waitForTimeout(2000) // the window's page is a sandboxed iframe, out of reach of the locators
    },
  },
  {
    name: 'desk',
    async prepare(page) {
      await open(page, 'release', 'feed')
      await page.getByRole('button', { name: WORDS.swipe }).click()
      await page.waitForTimeout(1200)
    },
  },
]
