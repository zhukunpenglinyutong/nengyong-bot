import { APICallError, type LanguageModel, wrapLanguageModel } from 'ai'
import type { ModelChoice } from '../shared/modelServices'
import { isUnreachable } from './describeError'

/** A language model object; a bare id would go to the AI SDK's global provider, which the app never uses. */
export type ModelObject = Exclude<LanguageModel, string>

export const modelIdOf = (model: ModelObject) => model.modelId

/** What a run calls: the model chosen for it, or the main model standing in for one that is gone or cannot be reached. */
export interface RunModel {
  model: LanguageModel
  name: () => string // the model the latest call ran on, for its entries and usage
  fallbackFrom: () => string | undefined // the chosen model once the main one has stood in for it
}

/** The models of the user's accounts besides the main one, which a bot, routine, flow or task can be set to. */
export interface ModelChoices {
  accounts: () => { id: string; name: string }[]
  listModels: (accountId: string) => Promise<string[]> // what the account offers; throws a readable reason when it cannot be reached
  modelOf: (choice: ModelChoice) => ModelObject | null // null: its account was removed
}

/**
 * The model for a run set to `chosen`, or on the main model when nothing is chosen. Once the chosen one cannot be
 * reached or its server no longer has it, the main model takes every later call of the run: a server that refused once
 * is not asked again mid-run.
 */
export function runModel(main: ModelObject, chosen: ModelChoice | undefined, choices: ModelChoices): RunModel {
  const onMain = { model: main, name: () => modelIdOf(main) }
  if (!chosen) return { ...onMain, fallbackFrom: () => undefined }
  const model = choices.modelOf(chosen)
  if (!model) return { ...onMain, fallbackFrom: () => chosen.model }
  const standIn = wrapLanguageModel({ model: main, middleware: [] })
  let hasFallenBack = false
  const tryChosen = async <T>(call: () => PromiseLike<T>, onStandIn: () => PromiseLike<T>): Promise<T> => {
    if (hasFallenBack) return onStandIn()
    try {
      return await call()
    } catch (error) {
      if (!isUnreachable(error) && !isMissing(error)) throw error
      hasFallenBack = true
      return onStandIn()
    }
  }
  return {
    model: wrapLanguageModel({
      model,
      middleware: {
        wrapGenerate: ({ doGenerate, params }) => tryChosen(doGenerate, () => standIn.doGenerate(params)),
        wrapStream: ({ doStream, params }) => tryChosen(doStream, () => standIn.doStream(params)),
      },
    }),
    name: () => (hasFallenBack ? modelIdOf(main) : chosen.model),
    fallbackFrom: () => (hasFallenBack ? chosen.model : undefined),
  }
}

/** The server answered that it has no such model: unloaded from a local server, or renamed or retired by the service. */
function isMissing(error: unknown): boolean {
  return APICallError.isInstance(error) && error.statusCode === 404
}
