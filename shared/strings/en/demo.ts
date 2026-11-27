import { plural } from '../../language'
import type { Strings } from '../../strings'

export const demo: Strings['demo'] = {
  disclaimer: {
    banner: "Demo mode: the bots, chats and figures here are made-up samples, not anyone's real data",
    title: 'This is a demo',
    body: "You opened the Nengyong Bot demo in a browser. The bots in the sidebar, their chats, mini apps and figures are samples written into the code: not your data, and not anyone else's. To use it for real, download the desktop app, or run npm run app in the project.",
    understood: 'Got it',
  },
  bots: {
    chief: 'Max',
    repo: 'GitHub daily',
    content: 'Content',
    support: 'Bug triage',
    release: 'Release helper',
    travel: 'Trip planner',
    fitness: 'Fitness coach',
    ledger: 'Family budget',
    ideas: 'Idea box',
  },
  sections: {
    myApp: 'My app',
    life: 'Life',
    family: 'Family',
  },
  chief: {
    plan: `Sync ships next month. I split it into three parts, each for the right bot:

- **Data**: GitHub daily posts the issue and star changes every morning and flags the issues about sync.
- **Feedback**: Bug triage sorts three months of feedback that mentions “sync” by problem and hands in a list by Friday.
- **Release**: once it is built, Release helper writes the release notes with its “Release notes” flow and shows you before posting.

You keep the development, and I sum up progress every Monday. Does that work?`,
    agree: 'Sounds good',
    handingOut: 'OK, handing out the three jobs now, starting with the feedback list.',
    feedbackStarted:
      'Bug triage is working on the feedback list in the background and will report back here. The first data report comes tomorrow at 9.',
    allSet: `All three are set:

- Feedback list: a background task is on it, and the result goes to \`feedback/sync-feedback.md\` in the library
- Data report: every day at 9:00, the first one tomorrow morning
- Progress summary: Monday mornings, written by me

The sync plan draft is in \`sync/sync-plan-draft.md\` if you want a look.`,
    askIdeaBot:
      'Make me one more bot just for the product ideas I come up with. Just note them down, no need to act on them yet.',
    willCreate: "I'll create “Idea box”. It only records and sorts ideas, and never acts on them on its own.",
    created:
      'Created [Idea box](bot:ideas). Send it whatever comes to mind: it notes it down, tags it and marks it “not started”.',
  },
  lastReplies: {
    secretary: "Hi, I'm Secretary Bot. What can I take care of for you?",
    repo: 'Yesterday brought 38 new stars and 2 new issues about sync, which I flagged.',
    support: "This week's 23 pieces of feedback are sorted. The top complaint is slow sync, 9 of them.",
    travel:
      'The five-day Kyoto itinerary is ready. Day 3 has a free afternoon: wander if you like, or rest at the hotel.',
    fitness: 'Three workouts this week. On Thursday, leg day, you can take squats up to 50 kg.',
    ledger: 'The family spent ¥8,460 this month, 6% less than last month. Takeout went over budget.',
    ideas: 'Noted: P-0001 “Save locally while offline, sync once back online”, marked not started.',
  },
  release: {
    askNotes:
      "Put together the v0.8 release notes: group them into features, fixes and other, and don't just copy the PR titles.",
    notesDone: 'Done. The draft is at `release/v0.8.md` in the library: 12 PRs, 4 features, 6 fixes and 2 other.',
    keepDoing: 'Good. Do it this way from now on, and show me before you post the release.',
    flowSaved:
      "Saved: [Release notes](flow:release-notes), 4 steps. Tell me before the next release and I'll follow it, and show you before posting.",
  },
  chats: {
    askProgress: "How's it going?",
  },
  releaseNotesFlow: {
    name: 'Release notes',
    when: 'When a release is coming and its notes need writing',
    listPrs: 'List the PRs merged since the last tag',
    groupPrs: 'Group them into features, fixes and other',
    rewrite: 'Rewrite each in words users understand instead of the PR title',
    confirmFirst: 'Send you the draft, and post it to the release once you approve',
    note: 'Always show you before posting to the release',
  },
  preMergeFlow: {
    name: 'Pre-merge check',
    when: 'You send a PR link and ask “can this merge?”',
    checkCi: 'Check that CI is all green; if not, report which check failed',
    readDiff: 'Read the diff for breaking changes and missing tests',
    checkCommits: 'Check the commit messages against CONTRIBUTING',
    verdict: 'Give a verdict: ready to merge, or what needs changing',
    note: 'Give the verdict and reasons only; never merge for you',
  },
  learnedFlow: {
    name: 'Weekly report',
    when: 'Fridays before the end of the day, or when you say “write the weekly report”',
    gather: "Go through this week's chats and task results and list what got done",
    group: 'Group by project, a sentence or two each',
    nextWeek: "List next week's work in a section of its own",
    note: 'At most 15 lines',
  },
  duty: {
    purpose: 'Get every release out clearly and without surprises.',
    notesObjective: 'Release notes never hold a release up',
    notesEarly: 'Release notes in a day before the release',
    notesEarlyNow: 'Last release: a day early',
    fewEdits: 'You change no more than a fifth of them',
    fewEditsNow: 'Last time: 30% changed',
    eachRelease: 'Each release',
    selfCounted: 'I count it',
    editsCompared: 'Your edits compared',
    safeObjective: 'Merged PRs cause no trouble',
    checksRun: 'Every pre-merge check run',
    checksRunNow: 'This week 4/5',
    eachPr: 'Each PR',
    notFeatures: 'Writing new features: the developers do that',
    notIssues: "Answering users' issues: the bug triage bot does that",
    planPurpose: 'Sum up what happened in the GitHub repos on one page every day, so you never dig for it.',
    planObjective: 'Every morning you know what happened in the repos',
    dailyBy9: 'Daily report in by 9:00',
    everyDay: 'Every day',
    issuesLabeled: 'New issues labelled within 24 hours',
    planOutOfScope: 'Replying to issues: you do that',
  },
  routines: {
    fridayRelease: 'Friday release notes',
    githubDaily: 'GitHub daily report',
    aiBriefing: 'AI coding and open source briefing',
    githubStats: 'Daily GitHub stats',
    opsReport: 'Daily ops report',
    feedbackDigest: 'Daily feedback digest',
    workoutReview: 'Nightly workout review',
  },
  tasks: {
    pr491: 'Can PR #491 merge?',
    pr491Status: 'Step 2/4: reading the diff',
    pr487: 'Can PR #487 merge?',
    bugDigest: "Sort this week's bug reports",
    bugDigestFailure: 'Could not reach GitHub: no response in 30 seconds',
    syncPlan: 'Draft the sync plan',
    syncPlanStatus: 'Comparing three ways to handle conflicts',
    weeklyReport: "This week's progress summary",
    invoiceCheck: 'Check the expense receipts',
  },
  library: {
    export: 'exports/nengyongbot-export-Max.json',
    syncPlan: 'sync/sync-plan-draft.md',
    feedback: 'feedback/sync-feedback.md',
    settingsShot: 'screenshots/sync-settings.png',
    conflictShot: 'screenshots/sync-conflict.png',
  },
  bridge: {
    autoReply: "Got it, noted. I'll check with you before doing anything.",
    learnWord: 'flow',
    miniAppReply: "Got it. I'll carry on from what you did in the mini app.",
    webOnly: 'The web version cannot do this. Use the desktop app (npm run app).',
    noMiniApp: (id) => `No mini app with id ${id}`,
    pageMissing: '<p>The page of this version is missing</p>',
    flowSaved: (mention, steps) =>
      `Saved: ${mention}, ${plural(steps, 'step')}. Say the word next time and I'll follow it.`,
    restored: (version) => `Restored to v${version}`,
    skillOffer:
      'I had a look: it teaches me to build spreadsheets properly, with one script that recalculates the formulas. Check the card; I’ll install it once you say yes.',
    skillInstalled: (mention) => `Installed. From now on I follow ${mention} for spreadsheets.`,
    skillDeclined: 'Fine, I won’t install it.',
    dutyOffer:
      "Here's a first version, from what I do day to day. Have a look at the card: every number can change, just tell me what's off.",
    dutyAgreed: "Agreed. I'll work by it, and put each new number on the panel as it comes in.",
    dutyDeclined: "OK, not yet. Tell me what's off and I'll show you a new card.",
    noDataDir: '(The web version saves no data)',
    greeting: (boss, team) => `Hi, I'm ${boss}.${team.length ? ` To start, I hired ${team.join(', ')}.` : ''}`,
  },
  debugTools: {
    remember:
      'Remember something useful for the long run. scope=user: about the user, shared by every bot; scope=bot: only about your job.',
    forget: 'Delete a memory (by the id in brackets before it).',
    proposeDuty: 'Show the user a duty card: objectives and key results, settled only when they agree.',
    updateMyName: 'Change the name the sidebar shows for you.',
    createBot: "Create a bot; it shows up in the user's sidebar.",
    createRoutine: "Create a routine; it shows in the Activity tab of the user's panel.",
    startTask:
      'Start a background task: it carries the job and memories and finishes on its own with file and web tools.',
  },
  debugPrompt: {
    intro: "You are this bot, one of the user's assistants. It is demo time.",
    jobHeading: 'Your job',
    job: "Track the open source project's numbers and report once a day.",
    userHeading: 'About the user (shared by every bot)',
    userFacts: '- [u1] Keep replies short, conclusion first',
    memoryHeading: 'Your memories',
    memories: '- [m1] The weekly report is due Fridays before 18:00',
    workHeading: 'How you work',
    workRules: '- In the chat you talk and hand out work…',
  },
  debugTrace: {
    title: 'Chat',
    input: (text) => `User: ${text}`,
    searchQuery: '{"query":"sync feedback"}',
    reply: 'Got it, noted.',
  },
}
