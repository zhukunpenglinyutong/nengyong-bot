import type { Strings } from '../../strings'

export const harness: Strings['harness'] = {
  unknownBot: (id) => `Unknown bot: ${id}`,
  noRunningTask: (id) => `No running task ${id}`,
  chat: {
    attachment: '(attachment)',
    traceTitle: 'Chat',
    quoteMissing: 'The message you are replying to is not in this chat',
    noModel: 'Not set',
  },
  modelErrors: {
    noKey: 'No API key is set yet',
    unreachable: (host) =>
      `Cannot reach the model service ${host}. Check the network; a model on this computer (Ollama, LM Studio…) has to be running first`,
    invalidKey: 'The API key is invalid; set it again',
    noBalance: 'The account balance is too low',
    unknown: 'Something went wrong; try again',
  },
  modelList: {
    invalidKey: 'The API key is invalid',
    noAccess: 'The API key has no access',
    noModelsPath: 'Wrong API address (no /models found)',
    tooManyRequests: 'Too many requests; wait a moment and try again',
    unreachable:
      'Cannot reach the API address. Check the network and the address; a service on this computer has to be running first',
    httpError: (status) => `The API returned an error (HTTP ${status})`,
    webPage: 'The address returned a web page, not an API. An OpenAI-compatible address usually ends in /v1',
  },
  brokenFinish: {
    interrupted:
      "The model's reply did not end normally: the API did not return a model reply, or the connection broke. Check the API address; an OpenAI-compatible one usually ends in /v1",
    error: 'The model failed before finishing its reply; try again',
    contentFilter: "The reply was blocked by the model's content filter",
  },
  modelSilent: (seconds: number) =>
    `The model sent nothing for ${seconds} seconds, so it was stopped. Try again, or switch models`,
  tasks: {
    noConclusion: 'The task ended without writing a conclusion',
    timedOut: 'Timed out: the task ran too long without finishing and was stopped',
    outOfSteps: (lastStatus) => `Out of steps before finishing${lastStatus ? `, stopped at “${lastStatus}”` : ''}`,
    resultClipped: (length, ref) =>
      ` (the conclusion has ${length} characters; open ${ref} with read_history for all of it, reading on as it says)`,
  },
  routineNotFound: (id) => `No routine with the id ${id}`,
  library: {
    outside: (path) => `The path is outside the library: ${path}`,
    missing: (path) => `The library has no such file: ${path}`,
  },
  mcp: {
    commandOrUrl: 'Each server needs either a command (a program on this computer) or a url (a remote address)',
    tooLong: 'The MCP config is too long',
    topLevel: 'top level',
    invalid: (where, reason) => `The MCP config has an error (${where}): ${reason}`,
    notJson: (reason) => `The MCP config is not valid JSON: ${reason}`,
    commandNotFound:
      'Command not found: check it is installed (npx needs Node.js), or write the command as a full path',
  },
  store: {
    mainBotDuty:
      "The user's main bot and chief of staff. Given a job, first check whether a dedicated bot fits it and hand the work to the one whose job matches; when none fits, I start a task for it myself.",
    chatOnly: 'Only messages in the chat can be deleted',
    notDataFile: (name) => `Not a Nengyong Bot data file: ${name}`,
    newerVersion: 'The data comes from a newer version of Nengyong Bot; update the app first',
  },
  miniApps: {
    notFound: (id) => `No mini app with the id ${id}`,
    dataTooLarge: (max) => `The data is too large: at most ${max} characters`,
    restored: (version) => `Restored to v${version}`,
    noVersion: (name, version) => `“${name}” has no v${version}`,
    pageMissing: (name, version) => `The page file of “${name}” v${version} is missing`,
  },
  skills: {
    notFound: (name) => `No skill named ${name}`,
    offerGone:
      'This install card has expired (after 30 minutes, or when the app restarts): ask the bot to read the skill again',
    uploadGone: 'This install card has expired (after 30 minutes, or when the app restarts): upload the skill again',
    fileGone: (file) => `The skill has no file ${file}`,
    full: (max, room) =>
      `A bot can have at most ${max} skills, so ${room} more fit: tick fewer, or remove ones it no longer uses`,
    noSkill: 'No skill here: there is no SKILL.md',
    tooManySkills: (count, max) =>
      `There are ${count} skills here, and a card holds at most ${max}: pick one of their folders instead`,
    tooLargeTogether: (max) => `The skills here add up to more than ${max} MB: pick one of their folders instead`,
    noneInstallable: (skipped) =>
      `None of the skills here can be installed:\n${skipped.map(({ folder, reason }) => `- ${folder}: ${reason}`).join('\n')}`,
    folderMissing: (folder) => `Folder not found: ${folder}`,
    folderTooBig: (folder) => `${folder} holds too many files to be a skill folder: pick the skill folder itself`,
    noSkillFile: 'The folder has no SKILL.md: a skill folder needs one at its top',
    badName: (name) =>
      `The skill name “${name}” is not valid: use lowercase letters, digits and dashes, at most 64 characters`,
    noDescription: 'SKILL.md has no description at its top: it should say when to use the skill',
    sameFile: (one, other) => `The skill has two files whose names differ only in case: ${one} and ${other}`,
    unsafePath: (file) => `The skill has an unsafe file path: ${file}`,
    tooManyFiles: (count, max) => `Too many files (${count}): a skill can have at most ${max}`,
    tooLarge: (megabytes, max) => `Too large (${megabytes} MB): a skill can be at most ${max} MB`,
    archiveTooLarge: (max) => `The archive is larger than ${max} MB`,
    archiveUnpacksTooLarge: (max) => `The archive unpacks to more than ${max} MB`,
    archiveBroken: 'The archive is damaged, or not a .zip',
    archiveEncrypted: 'The archive is password-protected: use one without a password',
    archiveUnsupported:
      'The archive uses a format or compression this app cannot read: make a regular .zip and try again',
  },
  onboarding: {
    alreadyDone: 'The onboarding is already done',
    secretaryDuty:
      'Handles the schedule and the small stuff: sorts the to-dos, sets priorities, plans each day and sets the reminders the user asks for',
    address: (address) => `The user wants to be called “${address}”`,
    hello: (address, bossName) => `${address ? `Hi ${address}` : 'Hi'}, I'm ${bossName}, your chief of staff.`,
    hired: (bots) =>
      `I've hired ${bots} for you; they're on the left. Tell me what you need and I'll hand it out. To talk to one of them alone, just open it.`,
    noModel: "I'm not connected to a model yet, so I can't reply for now: add an API key in Settings.",
    tryThese: 'Want to try one of these first?',
    list: (names) => `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`,
  },
}
