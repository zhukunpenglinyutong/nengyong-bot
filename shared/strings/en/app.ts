import { plural } from '../../language'
import type { Strings } from '../../strings'

export const app: Strings['app'] = {
  loadFailed: (reason) => `Nengyong Bot could not read its data: ${reason}`,
  failure: (what, reason) => `${what}: ${reason}`,
  editMiniApp: (name) => `Change “${name}”: `,
  time: {
    today: (clock) => `Today ${clock}`,
    yesterday: (clock) => `Yesterday ${clock}`,
    tomorrow: (clock) => `Tomorrow ${clock}`,
    minutes: (minutes) => `· ${minutes} min`,
    hoursMinutes: (hours, minutes) => `· ${hours} h ${minutes} min`,
    hours: (hours) => `· ${hours} h`,
  },
  activity: {
    thinking: ['Thinking', 'Sorting it out', 'Drafting in my head'],
    working: ['Getting on it', 'Busy with it', 'One step at a time', 'Heads down', 'On it'],
    noting: 'Making a note',
    lookingBack: 'Looking back',
    renaming: 'Changing my name',
    creatingBot: 'Creating a bot',
    startingTask: 'Starting a task',
    typing: 'Typing…',
  },
  themes: { light: 'Light', dark: 'Dark', system: 'Follow system' },
  accents: { black: 'Black', bot: 'Bot color' },
  failures: {
    saveSidebar: 'Could not save the sidebar',
    readChat: 'Could not read the chat',
    switchDebug: 'Could not switch debug mode',
    readContext: 'Could not read the context',
    readModelServices: 'Could not read the model services',
    readPreviews: 'Could not read the latest replies',
    readTasks: 'Could not read tasks and routines',
    readLimits: 'Could not read the limits',
    switchRoutine: 'Could not switch the routine',
    switchReview: 'Could not switch the weekly review',
    openFile: 'Could not open the file',
    stopReply: 'Could not stop the reply',
    stopTask: 'Could not stop the task',
    delete: 'Could not delete',
  },
  send: {
    tooLong: (max, length) => `The message is too long: ${max} characters at most, it has ${length}`,
    tooManyFiles: (max) => `You can send at most ${plural(max, 'attachment')} at a time`,
    fileTooBig: (name, megabytes) => `“${name}” is over ${megabytes} MB and cannot be sent`,
  },
}
