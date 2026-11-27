import { type ComponentProps, memo } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkCjkFriendly from 'remark-cjk-friendly/parseOnly'
import remarkGfm from 'remark-gfm'

/**
 * A skill's Markdown files, laid out as a document. Someone else wrote them: no raw HTML is rendered, no image loads
 * (a remote one would load without a click), and only web links open, in the browser.
 */
export const SkillMarkdown = memo(function SkillMarkdown({ text }: { text: string }) {
  return (
    <div className="text-md leading-relaxed break-words [&_code]:rounded-sm [&_code]:bg-bubble [&_code]:px-1 [&_code]:font-mono [&_code]:text-sm [&_code]:text-soft [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mt-5 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-bubble [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:block [&_table]:overflow-x-auto [&_table]:text-sm [&_td,&_th]:border-b [&_td,&_th]:border-line [&_td,&_th]:px-2 [&_td,&_th]:py-1.5 [&_td,&_th]:text-left [&_td,&_th]:align-top [&_th]:font-normal [&_th]:text-muted [&_ul]:list-disc [&_ul]:pl-5 [&>*+*]:mt-2.5">
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  )
})

const REMARK_PLUGINS = [remarkGfm, remarkCjkFriendly]

const COMPONENTS: Components = {
  img: ({ alt }) => <>{alt}</>,
  a: Link,
}

function Link({ href, children }: ComponentProps<'a'>) {
  if (!href || !/^https?:\/\//.test(href)) return <>{children}</>
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-accent hover:underline">
      {children}
    </a>
  )
}
