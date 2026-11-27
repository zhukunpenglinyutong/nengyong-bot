# 代码规范

写给每一个改这个仓库的人和 Agent。动手前读完，交付前对照最后一节。

## 启动

```sh
npm install     # 首次
npm run app     # Electron 桌面应用（开发）
npm run dev     # 只跑界面，在浏览器里看
npm run check   # 格式与 lint + 类型检查 + 全部测试，交付前必须通过
npm run format  # 按 Biome 的规则格式化并修掉能自动修的 lint
NENGYONGBOT_HOME=/tmp/nengyongbot-dev npm run app  # 换一个应用目录，开发数据不和日常数据混在一起
```

一个应用目录同时只让一个实例打开。装好的应用和开发的应用各有各的 profile，Electron 的单实例锁看不见对方；再开一个会直接提示并退出（`electron/homeLock.ts`），否则后开的会把前一个正在跑的任务当成中断，结论也交不回来。

## 技术选型

| 用途 | 选型 |
| --- | --- |
| 桌面壳 | Electron：主进程 + preload |
| 界面 | React + TypeScript |
| 构建 | Vite：渲染进程 `vite.config.ts`，主进程 `vite.electron.config.ts` |
| 样式 | Tailwind CSS，token 在 `src/index.css` 的 `@theme` |
| 动画 | motion |
| 模型 | Vercel AI SDK（`ai`）：DeepSeek 用 `@ai-sdk/deepseek`，其余 OpenAI 兼容接口用 `@ai-sdk/openai-compatible`（DeepSeek 的 provider 会给每条历史回复加只有 DeepSeek 认的 `reasoning_content`） |
| MCP | `@ai-sdk/mcp`：连本机（stdio）与远程（HTTP）的 MCP 服务，工具直接交给 AI SDK |
| 存储 | SQLite：Node 内置的 `node:sqlite`，不加原生依赖 |
| 边界解析 | zod |
| 定时 | croner：解析 5 段 cron、按 IANA 时区算下次运行（含夏令时），平台没有 |
| Markdown | react-markdown + remark-gfm + remark-cjk-friendly（CommonMark 的强调规则遇到中文标点会失效，`**「词」**后` 不加粗） |
| 自动更新 | electron-updater：从 GitHub Releases 下载新版本、退出时安装（Electron 自带的 autoUpdater 不支持 NSIS 安装包和 Linux） |
| 格式与 lint | Biome |
| 测试 | Vitest + Testing Library（jsdom） |

版本以 `package.json` 为准。换掉或新增其中一项，先过「依赖」一节。

## 取舍顺序

**正确与安全 → 简单 → 一致 → 简短。**

简单是概念少、彼此不缠绕，不是行数少。需要解码的一行不算短。

## 规则放在哪

这份文档是最后一道防线。Agent 会忘了读文字，但绕不过编译器和测试。

- **每纠正 Agent 一次，先把纠正变成检查，而不是往这里加一行字。** 选能做到的最靠前一层：
  1. 架构与 API：让错的写法写不出来，比如删掉那个选项，或者换一个不会用错的接口。
  2. 类型：让错的写法编译不过。
  3. 检查：加一条 Biome 规则，或在 `conventions.test.ts` 里加一个 `it`。
  4. 文字：只有需要判断的，才写进这里。
- **需要判断才能用对的东西，直接禁掉**，不靠 review 一个个看。
- **报错要说清怎么改。** 只说"不许"，Agent 会去找替身绕过去。
- **加检查的那次改动，同时清掉存量。** Agent 会照抄仓库里已有的写法，留一处旧写法，很快就会长出十处。
- 下文标了「Biome 会拦」「`conventions.test.ts` 会拦」的已经由机器执行；没标的靠自觉，也是下一批该变成检查的。

## 五条原则

1. **先问它该不该存在。** 没人要的功能、选项、抽象、依赖都不写。能删就删。
2. **一个概念，一个名字，一个出处。** 同一件事不出现第二种叫法、第二份常量、第二种写法。
3. **一条路径。** 两套行为不住在同一个组件里靠 `flag ? a : b` 切换。差异收在边界后面，边界给出同一个接口。
4. **依赖只朝一个方向。** 见「目录」。顶层目录之间的方向 `conventions.test.ts` 会拦。
5. **平台有的不自己写；重复到第三次才抽象。** 错误的抽象比重复贵。

## 目录

```
shared/     两个运行时共用的契约：类型、常量、zod schema。不碰 DOM、不碰 Node，不 import 任何目录。
harness/    Agent 运行时（Node）：循环、任务、工具（按用途分文件）、提示词、存储各占文件。只 import shared。
electron/   主进程与 preload。import harness 和 shared。
src/        渲染进程（React）。只 import shared。
  ui/                    不认识业务的零件：Dialog、Menu、Icon、Button。
  sidebar/ chat/ bot/    按领域收拢：组件、状态、hook、测试住在一起。
  demo/                  浏览器里的演示：假 bridge 和演示数据，只由 main.tsx 按需加载。
  remote/                设备那一端：走 HTTP 的 bridge、配对页和手机才有的零件，只由 main.tsx 按需加载。
  App.tsx                只做组装。
  PhoneApp.tsx           设备上的应用，也只做组装。
  main.tsx               唯一知道「桌面 / 设备 / 演示」三种环境的地方。
```

- `ui/` 不 import 领域目录。领域之间只用对方的组件，不借对方的内部零件。
- 两处都要用的东西搬到它们共同的上一层，不从兄弟文件 import。

## 命名

- **用完整的词。** 单字母只用于单行回调的参数。

  ```ts
  // Bad
  const C = Object.fromEntries(PALETTE.map((p) => [p.id, p.value]))
  <SidebarList h={list} />

  // Good
  const colorById = Object.fromEntries(PALETTE.map((p) => [p.id, p.value]))
  ```

- **术语表。** 每个词只指一件事，新概念先在这里登记。

  | 词 | 只指 |
  | --- | --- |
  | Bot | 侧边栏里的一个助手：`id`、`name`、`shape`、`color` |
  | Entry | 落盘的一条对话记录，只增不改。用户删掉的消息记进 `deleted` 表，所有读取（界面、模型、搜历史、等级）都跳过它，原记录不动 |
  | transcript | 一份 Entry 记录：一个 Bot 的聊天（id 是 Bot id）或一个 Task 的过程（id 是 Task id） |
  | Message | 聊天窗口里渲染的一条，由 Entry 算出来 |
  | Thread | 界面里一个 Bot 的对话状态：记录、正在流式输出的回复、排队、错误、进度、预览、面板，由 bridge 的事件算出来 |
  | Section | 侧边栏里的一个分组 |
  | dismissed | 离职的 Bot：用户在侧边栏菜单「离职…」、或主 Bot 用 dismiss_bot（用户同意了才用）让它离职后，它离开侧边栏，外形和原来的分组记在 `SidebarState.dismissed`，留 `DISMISSED_KEEP_DAYS`（7）天。设置「Bot 回收站」页（`DismissedSettings`）列出它们，期间点「恢复」回到原来的分组（分组不在了就回「其他」）；过了 7 天下次启动时去掉，再也找不回。它的记忆、聊天记录和例行任务一直留在数据库里，离职期间不在 roster 里，例行任务不跑 |
  | Task | Bot 在后台做的一件事：一次运行、独立上下文，过程记在以它的 id 命名的 transcript 里，做完把结论投回发起方的聊天 |
  | Routine | Bot 的例行任务：到点（cron + 时区）把一段指令作为这个 Bot 的一个 Task 在后台跑，结论投回它的聊天；显示在面板「近况」里 |
  | flow | 流程：Bot 存下来、以后照着做的一套做法（`shared/flow.ts` 的 `Flow`）：名字、什么时候用、步骤、注意事项。Bot 在聊天里用 save_flow 存和改（用户同意了才存），全部写进它的系统提示词；Task 和 Routine 可以按它的某个流程做（`flowId`），任务的系统提示词里带上那个流程。显示在面板「Bot 核心 · 流程」里，回复里写成 `[名字](flow:id)`，渲染成可点的流程名 |
  | skill | 技能：别人写好、装给某个 Bot 的做事方法包（`shared/skill.ts` 的 `Skill`）：一个含 SKILL.md 的文件夹，加上脚本和资料，格式和 Claude Code 的 Skills 一样。文件在数据目录的 `skills/<Bot id>/<名字>/`，装了哪些记在那个 Bot 的 `BotBrain.skills`。一张确认卡（`SkillOffer`）列出指向的地方找到的所有技能（技能合集也是一张卡），用户勾选后点「装上」才装；找法照 `npx skills`：技能文件夹里嵌套的 SKILL.md 算它的一部分，`metadata.internal` 的不列，同名的留第一个，装不了的连同原因列在卡上。每个 Bot 最多 150 个。两种装法：在聊天里，Bot 用 install_skill 读出技能，卡出在聊天里，答复记成一条 `skill-answer` Entry；或在面板「Bot 核心 · 技能」里从电脑上传（`SkillUploader`）一个技能文件夹或 .zip、.skill 压缩包，卡出在面板里，不进聊天、不叫醒 Bot。从同一个 GitHub 仓库、或电脑上同一个文件夹或压缩包装来的技能是一个技能合集（`SkillCollections` 的 `collectionOf`），面板里按合集分组列出。卸载用 remove_skill（一次可以好几个）、面板里技能的「卸载」或合集的「全部卸载」。use_skill、install_skill、remove_skill 只认自己的技能，主 Bot 的认所有 Bot 的；技能文件夹不另设保护，后台任务的文件工具和 run_command 照样读写得到，和资料库之外的文件一样。提示词里只列名字和描述，SKILL.md 写了 `disable-model-invocation: true` 的（`isUserInvoked`）只列名字，用户点名才用；后台任务用 use_skill 读全文再照着做，技能说明里的 Skill tool 就是 use_skill。显示在面板「Bot 核心 · 技能」里，回复里写成 `[名字](skill:名字)`，别的 Bot 的写成 `[名字](skill:Bot id/名字)` |
  | duty | 职责：Bot 为什么在这儿、要做到什么、怎么验收（`shared/duty.ts` 的 `Duty`），按 OKR 写：一句 purpose（为什么有它），最多 3 个 objective（目标：要的结果，不是动作），每个 1–4 条 key result（验收指标：数字、时间窗、数从哪来，带 Bot 用 report_progress 报的进度），加上不归它管的事。只有用户在职责卡（`DutyOffer`）上点「定下来」才改，每定一次升一版：Bot 用 propose_duty 在聊天里出卡（主 Bot 能替别的 Bot 出），答复记成 `duty-answer` Entry；同一个 Bot 有了新卡，旧卡作废。新 Bot 建好先开口问用户要什么结果（`welcome`），没定之前提示词让它一步步引导用户定；以前的一段 `instructions` 迁成没定的职责的 purpose。系统提示词里放在最前，面板「Bot 核心 · 职责」里显示 |
  | weekly review | 每周复盘：职责的开关，就是 Bot 名下一个每周一 9:00 的 Routine（`Duty.reviewRoutineId`），第一次打开时建，之后只暂停、恢复；在职责卡和面板「职责」里切换。结论回到聊天，Bot 用 report_progress 更新进度，要改的出新的职责卡 |
  | ability | 能力：面板里职责、流程和技能合在一起的页签（`AbilitiesTab`，页签上写「Bot 核心」），里面用三颗胶囊切换，打开时是职责；工牌上的「能力」是它的流程数加它自己的技能数 |
  | mini app | 小程序：Bot 写的一个手机竖屏大小的单文件 HTML 页面，加上它放进去的数据（`shared/miniApp.ts` 的 `MiniApp`）。后台任务用 save_app 新做或改页面，每改一次页面就是一个新版本，版本号只跟页面走；update_app_data 只换数据，不升版本。页面和数据存在资料库的 `apps/<id>/` 下。显示在面板「小程序」里，回复里写成 `[名字](app:id)`，渲染成聊天卡片；点开是浮在应用上的窗口（`MiniAppWindow`：沙箱 iframe，不能联网），右上角胶囊能收起到浮窗（`MiniAppDock`）或关闭。收起的 5 分钟内还收任务放进来的新数据，之后挂起；关掉的保留 30 分钟，之后销毁，再打开要重新启动（`miniAppRuns`）。页面通过 `window.nengyongbot` 读数据、存回数据、替用户给 Bot 发消息 |
  | language | 应用的语言：简体中文或英文（`shared/language.ts` 的 `Language`）。设置「通用 · 地区」里选，存在 `home/language.json`，没选过就跟系统；设备跟着电脑，演示和没配对的页面跟着浏览器。换了窗口重新加载。界面上的字在 `shared/strings/`，见「语言」 |
  | timezone | 应用的时区：固定北京时间（`shared/timezone.ts` 的 `TIMEZONE`，即 `Asia/Shanghai`），不看本机时区。Bot 眼里的现在、例行任务的默认时区、界面上的时间都按它算；设置「通用 · 地区」里显示 |
  | model | 大模型。侧边栏的编排数据叫 `SidebarState` |
  | service | 服务商：账号能接的模型服务（`shared/modelServices.ts` 的 `SERVICES`）：DeepSeek、OpenAI、通义千问……，本机的 Ollama、LM Studio、Bionic、oMLX，以及用户自己填地址的兼容接口。都走 OpenAI 兼容接口，在 `/models` 列出模型，连接时就靠它检测地址和 Key |
  | account | 账号：用户接上的一个 service：地址加 Key（Key 只进系统钥匙串，界面只拿到末 4 位）。每个 service 一个账号，兼容接口可以有多个。设置「模型服务」页下半部分列出账号；上半部分「用什么」选 main model 用哪个账号的哪个模型、网络搜索用哪个 DeepSeek 账号，选了就生效 |
  | Nengyong Key | Nengyong Bot 自己的模型服务（api.nengyongbot.com）的 Key，免注册，买了填进来就能用。还没上线，设置「Nengyong Key」页（`NengyongKeySettings`）只显示筹备中和上线后怎么用；「添加账号」列表最上面也有它一行（`ServiceList`），点了只在原地提示筹备中 |
  | main model | 主模型：设置「模型服务 · 用什么」选的那个账号的模型（`ModelServicesView` 的 `chat`）。没有 model choice 的聊天、任务、例行任务、流程都用它，压缩旧聊天记录只用它 |
  | model choice | 单独指定的模型：Bot 的聊天、Bot 的后台任务（`taskModel`）、Task、Routine、flow 可以记一个「哪个账号的哪个模型」（`ModelChoice`），Task 用自己的，没有就用它按的 flow 的，再没有就用它那个 Bot 后台任务的，开始时就定下来。只能由用户在聊天里要求、Bot 用 set_model 或 start_task、create_routine 的 model 设（每个 Bot 换自己的，主 Bot 还能换别的 Bot 的），界面只读显示（面板「近况」的「模型」：聊天、后台任务两行，和各条的模型标签），不放任何切换入口。连不上、服务那边没有这个模型（404）或账号断开时，那次运行改用 main model（`harness/runModel.ts`），Entry 的 `fallbackFrom` 记下原来的模型 |
  | model catalog | 模型目录：LiteLLM 维护的模型容量与价格表，`harness/modelCatalog.json` 内置一份（更新就重新下载覆盖）；内置的查不到某个模型时，每次启动最多下载一次最新的。用来查上下文容量（`windowTokens`，都查不到按 128k 估）和 price |
  | price | 模型单价：美元 / 百万 token，分输入、命中缓存的输入、输出（`shared/usage.ts` 的 `Price`）。先用用户在用量页填的（存在 `home/prices.json`），没有再查 model catalog，都没有就只记 token |
  | usage | 用量：每调一次模型记一行（`usage` 表：Bot、属于哪次运行、模型、输入 / 命中缓存 / 输出 token）。聊天的一轮连同它的压缩摘要算一次运行，记在实际调用的模型上，一个 Task 算一次运行；设置「用量」页按天（选「今天」时按小时）、Bot、来源（聊天 / 例行任务 / Bot 委托）和模型汇总最近 30 天，看的时候才按 price 估算成钱，不存钱数 |
  | measure | 统计口径：用量页按什么算：花费（人民币或美元）、token 还是运行次数，在用量页右上角的下拉框选、记在 localStorage（`src/settings/measure.ts`），概览、图表和明细都跟着它。人民币按固定汇率 `CNY_PER_USD` 从美元折算；price 始终是美元 |
  | settings | 设置窗口及其数据。不用 key 代指 |
  | home | 应用目录，默认 `~/.nengyongbot`（`NENGYONGBOT_HOME` 可改）：加密的账号与它们的用处（`model.bin`）、界面语言（`language.json`）、MCP 配置、精细化配置、用户填的 price、局域网访问的开关与配对过的设备（`devices.json`，只存令牌的哈希）与数据目录 |
  | device | 设备：用户放进来的手机、平板或别的电脑（`shared/devices.ts`）。它在浏览器里打开这台电脑的局域网地址，用的是这台电脑上的 Bot：聊天（也能停下回复）、看面板、开关例行任务、停任务、开小程序；设置、侧边栏编排和数据只在电脑上（`shared/devices.ts` 的 `DEVICE_METHODS`）。界面是 `PhoneApp`：Bot 列表、点开的聊天、抽屉里的面板，没有 island（手机自己的灵动岛就在上面）。设置「设备」页列出它们，随时能移除 |
  | LAN access | 局域网访问：设置「设备」页的开关，默认关。开着时主进程在 4317 端口开 HTTP 服务（`electron/lanServer.ts`）：给设备页面，转发它的 bridge 调用，用 server-sent events 推 `DEVICE_EVENTS` 里的事件。关掉时所有设备立刻断开，配对保留，再开时自己连回来 |
  | pairing | 配对：没连过的浏览器打开局域网地址时请求进来，它的屏幕上显示 4 位配对码，用户在电脑弹出的确认框（`PairingDialog`）里输入这组码，对上了它才拿到设备 Cookie。码只在发请求的那台设备上，别人同时发来的请求放不进来。同一时间只留最新的一个请求，2 分钟没答复就作废 |
  | dataDir | 数据目录，默认 `home/data`，可在设置里移到别处（新位置记在 `home/data-dir.txt`）：`nengyongbot.db` 与 `library/` |
  | library | 本地资料库：数据目录下的 `library/`，Bot 文件工具的相对路径从这里算起（绝对路径能读写别处）；面板「资料库」列出一个 Bot 在这里写过、仍在的文件，由它的 `write_file` 记录算出来 |
  | mention | 回复里的 `[名字](bot:id)`：渲染成头像加名字，点击打开那个 Bot；用户在输入框打 `@` 从菜单（`MentionMenu`，右侧是侧边栏分组）选出的 `@名字` 也叫 mention，以纯文本发出，Bot 按名字认。输入框（contenteditable）里它是不可拆的标签（`MentionChip`：头像加 Bot 色名字），退格一次删掉整个，发出时还原成 `@名字`；用户气泡里 `MentionText` 按名字认出它，画成同样的标签，名字改用气泡文字色加粗 |
  | ref | 一条 Entry 的引用号 `transcriptId#seq`：search_history 与 read_history 返回它，模型用它打开那一条和前后文 |
  | draft | 草稿：用户在一个 Bot 的输入框里写了还没发的东西：文字（mention 按 `@名字` 存，回来时还原成标签）、attachment、quote。每个 Bot 各一份，只在内存里；切到别的 Bot 不丢，发出后清空 |
  | quote | 用户回复聊天里某一条消息时带上的那一条：悬停消息点「回复」，输入框上方显示它；发出的用户 Entry 记下它的 seq 和开头（`quote`），气泡上方显示，模型读到这段开头和它的 ref |
  | requestId | Bot 一条回复来自哪次模型接口调用：接口给这次调用的响应 ID，记在 Entry 的 `requestId` 上；消息菜单「复制请求 ID」复制它，接口没给就没有这一项 |
  | queued | Bot 正在跑一轮时用户发来的消息：先显示成排队，这一轮结束后，下一轮把它们一起读进去、只回一次；开始读时才落盘 |
  | badge | 工牌：面板顶上挂在绳上的 Bot 卡片（`BotBadge`）。卡头是段位的颜色（Lv.60 起扫光，满级转彩虹），印着 Bot 自己的外形；卡上写着入职第几天（新建的 Bot 从 id 里的创建时间算，内置的从第一条 Entry 算）、对话次数、能力数（流程加技能）和工号（id 末 4 位，内置的用整个 id）。点条形码「刷卡」翻到背面的 desk，每次打开都从正面开始 |
  | desk | 工位：工牌的背面（`BotDesk`，插画在 `src/bot/desk/`）。Bot 坐在桌前，在做什么由 `deskState.ts` 算：回复、跑任务、任务失败时在干活，没活时摸鱼（刷短剧、打游戏、望窗外、打盹，10 分钟换一种，按 Bot id 错开）。书架上一本文件夹是一个 flow，便利贴是 Routine，纸堆是 library，绿植随入职天数长大，家具随段位升级，窗外和钟按 timezone 走。摆件能点，跳到面板对应的页签；戳 Bot 它会说一句，摸鱼时被戳会把屏幕切成报表 |
  | look | Bot 的外形：`shape` + `color`。创建对话框和面板头像编辑器里用 `LookPicker` 挑；Bot 有 avatar 时不画它 |
  | avatar | Bot 上传的图片头像：`Bot.avatar` 里一段 256×256 的 WebP data URL，有它时各处头像画这张图。面板头像编辑器「上传」页拖拽、粘贴或选本地图片，在圆形取景框里拖动缩放，存下来就换掉原来的外形；再挑一次外形或「移除图片」就回到 look |
  | outfit | 装扮：Bot 戴在 look 上的饰品（`shared/outfit.ts`），头饰、眼镜、胸前各戴一件（`Bot.outfit`）。按 trust 的段位解锁：每件的解锁等级都是某个段位的起点，Lv.1 有入门款，铜冠 Lv.10、银冠 Lv.30、金冠 Lv.60，往上到满级的彩虹冠；主 Bot 一开始就戴着金冠，摘了随时能戴回去。面板头像编辑器「装扮」页里戴、摘，点了就生效；没解锁的点了只说还差几级，不戴上。只在戴上那一刻看等级，等级掉了不收回。有 avatar 时不画。跨段位升级时升级卡片列出这一级解锁的装扮 |
  | attachment | 用户随消息发的文件：存进资料库的 `uploads/`，Entry 里记它的路径；png/jpg/gif/webp 同时作为图片发给模型 |
  | island | 聊天顶部的黑色胶囊（`src/island/`）：平时是 Bot 和它的等级，有后台任务时显示任务，来了 notice 就变形显示，点开是详情卡。这一轮回复的进度不上岛，留在消息下面；调试模式例外：平时多一段上下文用量，回复时显示第几步，点开是 `DebugCard` |
  | trust | 信任：由一个 Bot 的聊天记录算出的经验（`trustOf`；对话、沉淀新流程、按流程把任务做成各加不同的经验，界面上叫「经验」），决定它的等级 Lv.1–99、头像外圈的进度和段位；点开灵动岛后点等级徽章，卡片翻到等级说明（`LevelGuide`） |
  | notice | island 上自己会消失的消息：开着的 Bot 的任务结束、别的 Bot 回复、升级、学会或改了流程；调试模式下还有记住了、上下文已压缩、步数用完 |
  | bot status | Bot 状态：侧边栏上一个 Bot 此刻在做什么，不是任务的 `status`（`src/sidebar/botStatus.ts` 的 `BotStatus`），按顺序取第一个成立的：没跑成（它最后结束的任务失败了，而且是在用户上次打开或离开它的聊天之后，记在 `SidebarState` 的 `seenAt`；正开着的不算）、回复中、跑任务、排队、空闲。头像右下角的圆点（`StatusDot`：绿色转圈是在干活，灰色三点是排队，红色 ! 是没跑成）、名字下面那一行（空闲时还是最后一句回复）、收起的分组标题右边的计数、搜索框里能点来筛选的计数都由它算；鼠标停在 Bot 上浮出 `BotStatusCard`：失败原因、正在做的事、例行任务。启动时没打开过的 Bot 的任务和例行任务由 `tasksAndRoutines` 一次带回 |
  | onboarding | 还没走过引导时（新用户，或引导上线前就有数据的老用户）盖在应用上的引导（`src/onboarding/`）：给主 Bot 起名、问用户称呼、讲 Bot 能做什么、接模型、按身份招 Bot，最后新 Bot 飞进侧边栏、主 Bot 先开口；走完之前什么都不存 |
  | identity | 引导里用户选的身份（程序员、产品经理……）：每个身份带 5 个可招的 Bot 和几条建议 |
  | MCP | 用户接入的 MCP 服务：配置存在 `home/mcp.json`（Claude Desktop 的 mcpServers 格式），在设置「工具」页编辑；工具只给 Task，名字是「服务名__工具名」 |
  | debug | 调试模式（设置「通用 · 开发者」）：面板显示最近任务，灵动岛显示 context、trace 和变更，设置里多出「精细化配置」 |
  | limits | 精细化配置：Bot 干活的各项上限（每轮步数、原样发给模型的记录条数、任务超时……，`shared/limits.ts` 的 `Limits`），调试模式下在设置里改、可一键恢复默认值；存在 `home/limits.json`，只记和默认值不同的项，从下一轮回复或下一个任务开始生效 |
  | context | 调试模式里一个 Bot 的聊天发给模型的东西（`ContextView`）：系统提示词分段、摘要之后的对话记录、工具；token 总数来自接口，分项按字数折算 |
  | trace | 调试模式里一次运行的过程（`Trace`）：一轮聊天（id 是 Bot id）或一个 Task（id 是 Task id），每一步调用了什么、多久、多少 token；只在内存里 |
  | suggestion | Bot 消息下的建议（Entry 的 `suggestions`）：点一下填进输入框、不替用户发，这条消息后面一有内容就不再显示 |
  | selection | 多选：在一条消息上按住（或菜单「多选」）进入，点整行切换、按住拖过连选、Shift 选一段、⌘A 全选、Esc 退出；选中的消息可以一起删除、复制或做成 share card。这时输入框换成底栏（`SelectBar`） |
  | share card | 分享图片：选中的消息排成的一张卡片（`ShareCard`），Bot 色、简洁、深色三种样式，按 3 倍画成 PNG，可复制或保存 |
  | release | 一个版本的更新记录（`src/settings/releases.ts` 的 `Release`）：版本号、日期、标题、配图或动图的亮点、其他改进，最新的在最前、就是正在运行的版本。设置左下角显示这个版本号，点开是「更新记录」页 |
  | update | 检查更新：装好的应用启动 3 秒后到 GitHub Releases 静默查一次（`electron/updates.ts`），查不到、已是最新都不打扰；有新版本就在窗口右下角弹窗（`UpdatePopup`），用户点「立即更新」才下载，进度显示在弹窗里，下完重启进新版本；点「稍后」就留到设置「更新记录」页顶部（`UpdateCheckRow`），那里也能随时手动检查，结果显示在按钮旁边。新版本第一次打开时弹窗说一声更新了什么，每个版本一次。测试版也收后面的测试版，正式版只收正式版 |

- **联合类型的判别字段一律叫 `kind`。**
- **含义变了就全仓改名。** 不留"历史原因"的名字。
- 布尔用 `is` / `has` / `can` 开头；事件 prop 用 `onX`；常量 `UPPER_SNAKE` 并带单位（`TIMEOUT_MS`、`MAX_BYTES`）。
- 文件名等于主导出名：组件 `PascalCase.tsx`，hook `useX.ts`，其余 `camelCase.ts`。

## 文件与函数

- **按概念拆。** 一个文件一个概念。需要 `// ---- 分隔线 ----` 的文件是两个文件。函数过 50 行，先怀疑里面混了两个概念。
- **一个源码文件最多 500 行，测试文件不限。** 超了必须拆，沿概念的边界拆，不是在第 500 行切一刀。`conventions.test.ts` 会拦。
- **主角在最上面。** 文件以它命名的那个导出放第一个，辅助函数按调用顺序排在下面。
- **只导出别的文件真正在用的。** 没人用的导出 `conventions.test.ts` 会拦；只用具名导出（Biome 会拦），不建 `index.ts`。
- **不为"以后"留东西。** 没接线的按钮、没人用的 token、只有一个调用点的选项，都删。让代码变死的那次改动负责删掉它。
- **只用一次的 helper 就地内联**，除非它本身是一个值得起名的概念。
- 顶层具名函数用 `function`，回调和单表达式用箭头。

## TypeScript

- 对象形状用 `interface`，联合与别名用 `type`。
- **不写 `as` 和 `!`**（`as const`、`satisfies` 除外）。收窄，或者在边界解析。`!` 和不安全的 `as` Biome 会拦。

  ```ts
  // Bad
  const item = items[i] as Item

  // Good
  const item = items[i]
  if (item === 'separator') return
  ```

- **遍历联合用 `switch`，让编译器查漏。** 不写 `else if` 长链。

  ```ts
  switch (event.kind) {
    case 'draft':
      return { ...state, draft: event.text }
    case 'busy':
      return { ...state, busy: event.busy }
    default:
      return event satisfies never
  }
  ```

- `const` 优先，提前返回，不写 `else`。
- **数据不可变。** 不改入参，不改 state。状态更新写成纯函数 `(state, 参数) => state`。必须可变的地方（store 的闭包、ref）要小、集中、有名字。
- 不用 class（`Error` 子类除外）、enum、namespace。模块加工厂函数（`createStore`）就够。

## 边界与错误

- **外部数据进门时用 zod 解析一次，进门后信任类型。** 门有五扇：IPC 入参、工具入参、localStorage、数据库与磁盘上的 JSON、网络响应。

  ```ts
  // Bad
  const raw = JSON.parse(text) as Partial<HarnessState>

  // Good
  const state = HarnessState.parse(JSON.parse(text))
  ```

- **出错就在源头 `throw new Error('用户看得懂的原因')`。** 只在边界接：IPC handler、工具执行器、界面事件处理。工具失败一律 throw，不返回 `{ error }`。
- **不吞错误。** 空 `catch` 要有一行注释说明为什么可以忽略。渲染进程的错误要显示给用户，不能只进 console。不写 `console.log`（Biome 会拦）。
- **安全线只进不退：**
  - 窗口保持 `contextIsolation` + `sandbox`；preload 每条 IPC 消息暴露一个方法，不暴露 `ipcRenderer`。
  - 渲染进程、模型输出、网页内容都当不可信输入。
  - 渲染进程递进来的路径（附件协议、打开资料库文件）出不了资料库，用 `workspace.resolve`；`fetch_url` 进不了内网；Markdown 不渲染原始 HTML 和远程图片（资料库里的图片走附件协议显示）。Bot 的文件工具、命令工具（`run_command`，任务里用 shell 执行命令，工作目录是资料库）和 MCP 服务是用户给的本机能力，能读写资料库之外，不受这一条约束。
  - API Key 只进系统钥匙串，不回传渲染进程。
  - 局域网访问默认关。只认这台电脑自己的地址（挡 DNS 重绑定），POST 要同源，除了打开页面和配对都要设备 Cookie（HttpOnly、SameSite=Strict）；设备能调的方法（`DEVICE_METHODS`）和能收的事件（`DEVICE_EVENTS`）都是白名单，新加的默认不给设备。

## 语言

- **界面上的字只住在 `shared/strings/`。** `zh/` 和 `en/` 下按领域各一个文件（`settings.ts`、`miniApp.ts`……），代码里写 `strings().<领域>.<键>`。带参数的写成函数：`` closeApp: (name: string) => `关闭 ${name}` ``。英文文件的类型是 `Strings['<领域>']`，少了键、参数对不上都编译不过。`src/`、`shared/`、`electron/` 里 `shared/strings/zh/` 以外出现中文，`conventions.test.ts` 会拦。
- **人看得到的都算**：界面、报错、通知、菜单、原生对话框、引导、更新记录、演示数据、落盘后给人看的默认值。
- **只给模型读的字留在 `harness/` 的代码里，写中文**：系统提示词、工具说明、只回给模型的工具结果。模型用什么语言回复，由提示词里跟着应用语言的那一行决定。
- **键按用途起名，不按字面**：`closeApp`，不是 `closeName`。一个领域里按界面分组，最多再嵌一层。
- **`src/` 之外，`strings()` 只在函数里调用。** 主进程加载完模块才知道语言，运行中还会换。对象表里的字段用 getter（`TIERS` 的 `name`），zod 的报错写成 `{ error: () => strings()… }`。`src/` 的模块可以在顶层调用：`main.tsx` 先定好语言再加载应用，换语言时窗口重新加载。
- 日期和数字按 `locale()`（`shared/language.ts`）格式化，不写死 `'zh-CN'`；英文的单复数在英文文件里用 `plural`。
- 英文沿用 README 的叫法：bot、main bot、task、routine、flow、mini app、library、panel、island、badge、desk。界面里用句首大写（Open data folder），只有 macOS 原生菜单用标题大写。

## React

- **一个组件一件事。** `App` 只组装，不存业务状态，不写定时器。
- **能算出来的不存。** state 放在用它的最低一层。
- **不传"回调包"。** 一个 prop 里塞了一堆回调，说明状态放错了层；跨三层以上再用 context。
- **hook 返回数据和函数，不返回 JSX。**
- 几份 `Record<id, …>` 被同一串事件更新时，合成一个 reducer：`(state, event) => state`。
- **组件和领域 hook 里不写 `useEffect`、`useLayoutEffect`，也不用 `setTimeout`、`requestAnimationFrame` 等渲染或排先后。** 它们需要判断才能用对，Agent 最常用错。`conventions.test.ts` 会拦。按情况换成：
  - 能从 props、state 算出来的：渲染时直接算。
  - 用户操作引起的：写在事件处理函数里。
  - prop 变了要重置状态：给组件换 `key`。
  - 和外部系统同步（bridge 订阅、DOM 事件、焦点、定时器）：用 `src/ui/` 里起好名字的 hook；没有合适的，就在 `ui/` 新加一个，名字说清它同步的是什么。
- effect 只住在 `src/ui/` 的 hook 和 `src/useHarness.ts` 里。在那里要读最新的 props，用 `useEffectEvent`，不手写 `ref.current = value`。

## 样式

- **颜色、字号、圆角、阴影、缓动、时长只来自 `src/index.css` 的 `@theme`。** TSX 里不写 hex，不写 `text-[13.5px]`。一次性的布局尺寸（`w-[450px]`）可以用任意值。颜色、字号、圆角、阴影 `conventions.test.ts` 会拦。

  ```tsx
  // Bad
  <small className="text-[13px] text-[#8a8a8a] hover:bg-[#e9e9e9]" />

  // Good
  <small className="text-sm text-muted hover:bg-hover" />
  ```

- **token 是预算。** 字号不超过 7 档，中性灰不超过 8 档。缺了先证明现有的不够，再加，并按用途命名（`hover`、`danger`、`accent`），不按色值命名。
- **状态写在属性上，样式用变体读它，不拼字符串。** 没有对应的 `aria-*` 时用 `data-*`。

  ```tsx
  // Bad
  <button role="switch" aria-checked={on} className={`h-5 w-8 ${on ? 'bg-ink' : 'bg-line'}`} />

  // Good
  <button role="switch" aria-checked={on} className="h-5 w-8 bg-line aria-checked:bg-ink" />
  ```

- **能点的就用 `<button>` 或 `<a href>`，两种反馈由 `src/index.css` 的 base 层统一给出：** 小手；悬停和键盘聚焦时，在按钮原有背景上叠一层 8% 的文字色（白底变灰，黑底变亮）。按下时什么都不变，不缩放（`active:scale-*`、`whileTap` 都不写）：宽的按钮一缩，两边会露出一道缝。组件里不写 `cursor-pointer`、`cursor-default`，也不写 `hover:bg-*`、`focus:bg-*`。选中态照常写（`aria-current:bg-hover`），悬停叠色会自动叠在它上面。不能点的时候用 `disabled` 或 `aria-disabled`，两种反馈会一起去掉。`<div onClick>` Biome 会拦，其余写法 `conventions.test.ts` 会拦。
- **点下去，结果要看得见。** 结果自己就在眼前的（开关翻过来、列表变了、窗口开了）不用另说；结果不在眼前的（复制、自动保存、存到别处），就在用户点的地方说一句，过两秒自己消失：用 `ui/useFlash`，比如按钮文字换成「已保存」。失败一定要说出来，不能只进 console。复制只走 `ui/useCopy`，菜单项写 `copy: 文本`，两者都会在原地显示「已复制」或「复制失败」（`conventions.test.ts` 会拦）。
- **重复的样式抽成组件，不导出 class 字符串常量。** 要的是 `<IconButton>`，不是 `circleBtn`。
- class 串写在一行，不在模板字符串里换行。
- 头像和它的装扮（`OutfitPiece.tsx`）、desk（`src/bot/desk/`）和模型厂商的标志（`ModelLogo.tsx`）的图形和配色是插画内容，不受 token 约束。

## 动画

- **会出现、会消失的浮层，进场和退场都要有动画。** 对话框、菜单、弹出层、盖在界面上的提示都算，瞬间冒出、瞬间消失显得生硬。退场要等动画播完才能卸载，所以条件渲染外面包一层 `AnimatePresence`：

  ```tsx
  <AnimatePresence>
    {isOpen && <SettingsDialog onClose={close} />}
  </AnimatePresence>
  ```

- **对话框用 `ui/Dialog`，动画它自带**：缩放加淡入淡出，背景同时淡入淡出，调用方不再另写。没有直接包在 `AnimatePresence` 里时它会报错，嵌在另一个对话框里的也要自己包一层（`Dialog` 会拦）。
- **菜单和弹出层用 `ui/motion.ts` 的 `POP`**，不各写一份数值。正在退场的浮层设 `inert={!useIsPresent()}`，不然双击时第二下会落在正在消失的按钮上，把操作做两遍。
- 可能紧接着在别处重新打开的浮层（右键菜单）按打开的位置换 `key`：旧的淡出，新的同时出来，不复用旧的位置和状态。
- 减少动态效果由 `App` 里的 `MotionConfig reducedMotion="user"` 统一处理：关掉位移和缩放，只留淡入淡出，各处不用自己判断。

## 注释

- **默认不写注释。** 注释会过时，没人读，也检查不了。要解释的东西，靠改名字、拆函数、加类型让代码自己说清。
- **注释不为绕路辩护。** Agent 会写一行注释给临时补丁找理由，下一个 Agent 照着抄。要绕路、要破例，就改代码或改规范。不写 TODO、`shortcut:`，不留注释掉的代码。
- 只有三种例外，各写一行英文：
  - 代码改变不了的外部事实：平台、库或协议的怪行为。写不这样会出什么问题，不写代码在做什么。

    ```ts
    // lstat, not exists: a dangling symlink counts as present, so realpath fails instead of writing through it
    ```

  - 检查的上方写它守的是哪条规范，例如 `// AGENTS.md「目录」: ...`。
  - `biome-ignore` 后面写原因。
- 界面文案中英文都写，见「语言」。

## 测试

- 测试紧挨被测文件，同名：`chatMessages.ts` 配 `chatMessages.test.ts`。
- 一个 `it` 只验一个行为，名字是一句完整的行为描述。
- 纯逻辑直接测函数。界面按用户的方式测（role、label），不查 class，不查内部状态。
- 修 bug 先写一个会失败的测试。

## 依赖

加依赖前写明平台和现有依赖为什么做不到。几行能写完的不加。

## 发版

- **升版本号的那次改动，同时在 `src/settings/releases.ts` 最前面写上这个版本的更新记录**：一句标题，几条亮点（每条配一张图或一段几秒的动图，放 `src/settings/releases/<版本>/`，用 WebP），再列其他改进。`conventions.test.ts` 会拦。
- 动图同时给一张静图（`still`），系统设了减少动态效果时显示它。

## 提交

- **绝不自动 commit。** 改完停在工作区；只有用户明确要求「提交」时才执行 `git commit`。不要顺手提交，也不要替用户决定提交时机。
- **commit message 只用英文。** 前缀照常用 `feat` / `fix` / `refactor` / `docs` / `chore`，后面一句英文描述，例如 `feat: upload an image as a bot avatar`。不写中文；此前的历史提交不改。

## 交付前

1. `npm run check` 通过。
2. 改了界面或交互的，在真的应用里走一遍（`npm run app`，或 `npm run dev` 看演示），交付时附上证据：截图，或者做了哪些操作、看到了什么。测试通过不等于能用。
3. diff 里每一行都答得上「删掉它会怎样」。
4. 没有新增的任意色值、`as`、`!`、`console.log`、`useEffect`、例外之外的注释、没人用的导出。
5. 改了含义的名字已经全仓改完；术语表里没有的新词已经登记；新加的字中英文都有。
6. 这次纠正过的错误，能变成检查的已经变成检查。
