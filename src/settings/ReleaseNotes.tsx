import { ReleaseFigure } from './ReleaseFigure'
import { type Release, RELEASES } from './releases'
import { SettingsPage } from './SettingsSection'
import { UpdateCheckRow, type UpdateProps } from './UpdateCheckRow'
import { strings } from '../../shared/strings'

/** Updates: checking for a newer version, and what each version changed, newest first. Opened from the version at the bottom of the settings pages. */
export function ReleaseNotes(props: UpdateProps) {
  const words = strings().settings.releaseNotes
  return (
    <SettingsPage title={words.title} intro={words.intro}>
      <UpdateCheckRow {...props} />
      {RELEASES.map((release, index) => (
        <ReleaseArticle key={release.version} release={release} isCurrent={index === 0} />
      ))}
    </SettingsPage>
  )
}

function ReleaseArticle({ release, isCurrent }: { release: Release; isCurrent: boolean }) {
  const words = strings().settings.releaseNotes
  return (
    <article
      aria-label={release.version}
      className="border-line pt-8 pb-10 not-first-of-type:border-t first-of-type:mt-3"
    >
      <header className="flex items-center gap-2">
        <span className="font-mono text-sm font-semibold">{release.version}</span>
        {isCurrent && <span className="rounded-sm bg-bubble px-1.5 text-xs text-soft">{words.current}</span>}
        <time dateTime={release.date} className="ml-auto text-xs text-muted">
          {release.date}
        </time>
      </header>
      <h3 className="mt-1.5 text-lg font-semibold tracking-tight">{release.title}</h3>
      {release.highlights.map((highlight) => (
        <section key={highlight.title} className="mt-10">
          <h4 className="text-md font-semibold">{highlight.title}</h4>
          <p className="mt-1.5 mb-4 text-sm text-soft">{highlight.text}</p>
          <ReleaseFigure media={highlight.media} />
        </section>
      ))}
      {release.highlights.length > 0 && <h4 className="mt-10 text-md font-semibold">{words.otherImprovements}</h4>}
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-soft">
        {release.others.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  )
}
