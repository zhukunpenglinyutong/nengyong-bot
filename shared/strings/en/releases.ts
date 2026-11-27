import type { Strings } from '../../strings'

export const releases: Strings['releases'] = {
  versions: {
    '1.0.0-beta.3': {
      title: 'Skills for your bots',
      others: [
        'While a bot replies, the send button becomes a stop button. Stopping keeps what it wrote so far, and queued messages go next. Paired phones and tablets can stop replies too',
        'When the model sends nothing for 5 minutes, the reply or task stops and says why instead of waiting forever. In debug mode, change it under Model silence timeout in Settings · Limits',
        'The theme can now follow the system, switching between light and dark with it',
        "The panel's Flows tab is now Abilities, holding both flows and skills; the badge counts abilities instead of flows",
      ],
    },
    '1.0.0-beta.2': {
      title: 'New avatars, new outfits',
      others: [
        'Only one copy of Nengyong Bot can open an app folder at a time. A second one says so and quits, so the background tasks of the first are not taken as interrupted and their results still come back',
        'One command in a background task runs for at most 5 minutes; past that the command is stopped and the task carries on. In debug mode, change it under Command timeout in Settings · Limits',
        'Stopping a task from the panel just as it ends no longer shows an error',
      ],
    },
    '1.0.0-beta.1': {
      title: 'Open source: the first public beta',
      others: [
        'Open source on GitHub. The installed app checks for a new version at every launch, downloads it in the background and installs it when you quit',
        'The interface comes in Simplified Chinese and English. It follows your system language; switch it under Language in Settings · General',
        'Background tasks can run commands, with the library as the working directory, and use the local and remote MCP servers you connect under Settings · Tools',
        'The Usage page sums the last 30 days of tokens by day, bot, source and model, estimates the cost from unit prices, and can count in CNY, USD, tokens or runs',
        'Every bot earns experience and levels up: chatting, saving a new flow and finishing a task by a flow all count, up to Lv.99. Open the island and click the level badge for the details',
        'Type @ in the message box to mention another bot; press and hold a message to select several, then delete them, copy them or turn them into a share image',
        'Closing the window keeps the app in the tray, and background tasks keep running',
        'The data directory can be moved, and Settings · Data exports a full backup and imports it back',
      ],
    },
  },
  highlights: {
    skills: {
      title: 'Skills: give a bot a way of working someone else wrote',
      text: "A skill is a ready-made way of working: a SKILL.md with instructions, plus scripts and references, in the same format as Claude Code's Skills. Send a bot a GitHub link or the path of a skill folder, and it lists the skills it found on a card; nothing is installed until you tick them and click Install. You can also upload a skill folder or a .zip or .skill archive under Abilities · Skills in the panel. Once installed, the bot's background tasks follow the skill when the work matches. Skills from the same repository are grouped into a collection, where you can see their files and how often they were used, and remove them one by one or all at once. The main bot can see, use and manage every bot's skills.",
      alt: 'On the left, sending a bot the GitHub link of the xlsx skill and getting a card to confirm; on the right, the anthropics/skills collection installed under Abilities · Skills in the panel',
    },
    avatar: {
      title: 'Upload an avatar: give a bot a picture you choose',
      text: "Click the avatar on the panel's badge, switch to Upload, then drop in an image, paste one or choose one from your computer. Drag and zoom it inside the round frame and click Save: the sidebar, the chat and the badge all show the new avatar. To go back, pick a shape or click Remove image.",
      alt: 'On the left, a picture of a puppy adjusted in the round frame; on the right, the badge with the new avatar',
    },
    outfit: {
      title: 'Outfits: the higher the level, the more to wear',
      text: 'The avatar editor has a new Outfit page: one piece each for the head, the face and the chest, put on with a click. The party hat, round glasses and bow tie are there from the start; sunglasses and the bronze, silver and gold crowns unlock as the bot levels up, all the way to the rainbow crown at the top level. Click a piece that is still locked and it tells you how many levels to go. When a level-up reaches a new rank, the level-up card lists the outfits it unlocked. The main bot starts out wearing the gold crown, and can put it back on any time after taking it off.',
      alt: 'On the left, the Outfit page putting a party hat, round glasses and a bow tie on a bot, with the locked pieces marked by level; on the right, the badge with the outfit on',
    },
    flow: {
      title: 'Flows: get it right once, save it, repeat it',
      text: 'Once a bot gets a job right with you, say “do it this way from now on”. With your OK it saves the way it did it as a flow: when to use it, the steps and what to watch out for. Later tasks and routines follow the flow, and a flow name in a reply opens with a click.',
      alt: 'Telling a bot “save it as a flow”: it saves the flow and the island announces it',
    },
    miniApp: {
      title: 'Mini apps: a page you can tap, made by a bot',
      text: "Ask a bot for a dashboard, a daily report or a small tool, and it writes a phone-sized page in the background, puts the data in and attaches a card to its reply. The card opens a window over the app that can shrink to a small floating dock at the edge of the screen; a button in the page sends your message to the bot for you. Say “change it” while it is open and the bot knows which one you mean. Every change to the page is a new version: the panel's Mini apps tab shows the history, restores an old version and exports one as a single HTML file. Pages run in a sandbox with no network access.",
      alt: 'Opening the daily marketing report mini app and tapping Add in the page: the message goes to the chat, the bot replies, and the window shrinks away',
    },
    status: {
      title: 'See at a glance who is busy and whose task failed',
      text: "A small dot sits at the corner of each avatar: a green spinner means replying or running a task, three gray dots mean queued, and a red exclamation mark means a task failed. The line under the name says what the bot is doing and for how long, and still shows its last reply when idle. Hover a bot for a card with the failure reason, the work in hand and its upcoming routines. The search box shows how many bots are working and how many failed; click a count to see only those bots. A collapsed section shows the same two counts next to its title. The red mark goes away once you have opened that bot's chat.",
      alt: 'The sidebar: the search box shows 2 working and 1 failed; hovering the failed bot shows a card saying GitHub could not be reached',
    },
    desk: {
      title: 'Desk: flip the badge to see what the bot is up to',
      text: "Click the barcode on the badge to swipe it, and the card flips over to the bot's desk. It works heads-down while replying or running a task, and slacks off when idle: watching short dramas, gaming, gazing out the window, napping. Folders on the shelf are its flows, sticky notes its routines and the paper stack its library; click one to jump to that tab of the panel. The plant grows with days on the job, the furniture improves with its rank, and the window and wall clock follow Beijing time. Poke the bot and it says something back; poke it while it slacks off and it hurries to switch its screen to a report.",
      alt: 'Swiping the badge to the desk, poking a bot that is running a task, then clicking a folder on the shelf to jump to the flows tab',
    },
    phone: {
      title: 'Connect a phone or tablet and use the bots on your computer',
      text: 'Turn on LAN access under Settings · Devices, then scan the code with the camera of a phone or tablet on the same Wi-Fi, or open the address on the page in its browser. The phone shows a 4-digit pairing code; enter it in the box that pops up on the computer and you are connected. From there you can chat with your bots, check their panels, switch routines on and off, stop tasks and open mini apps, and add the page to the home screen to open it like an app. Chat history, keys and the library stay on the computer, and settings and the sidebar are still changed only there. The Devices page lists every paired device and whether it is online, and you can remove one at any time; turning LAN access off disconnects every device at once.',
      alt: 'Nengyong Bot on a phone: on the left the list of bots, marking the ones at work and the one whose task failed; on the right an open chat',
    },
    models: {
      title: 'Model services: connect many providers, switch models by asking',
      text: "The Model services page connects accounts with providers such as DeepSeek, OpenAI, Anthropic, Qwen, Kimi and OpenRouter, as well as Ollama, LM Studio, Bionic and oMLX on your own machine, or any compatible API at an address you enter. Keys are stored encrypted on this computer, and the interface shows only the last 4 characters. Bots use the main model you pick by default; to give a bot, its background tasks, a routine or a flow another model, just tell it in the chat, for example “use Kimi for the health check” or “chat with me on the local qwen from now on”. The panel's Activity tab shows which model it is on. When the chosen model cannot be reached, the run falls back to the main model and tells you.",
      alt: "The Model services page: main model deepseek-flash, with a note that to switch a bot's model you tell it in the chat",
    },
  },
}
