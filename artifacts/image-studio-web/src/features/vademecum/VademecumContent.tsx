import type { VademecumContent as Content } from './natale-2026';

/** Contenuto del vademecum, senza dipendenze dal router: usato dalla pagina pubblica. */
export function VademecumContent({ content }: { content: Content }) {
  return (
    <article className="space-y-8" data-testid="vademecum-content">
      <header className="space-y-2 text-center">
        <h1 className="text-3xl font-bold text-blue-gray-900">{content.title}</h1>
        <p className="text-lg text-gray-600">{content.subtitle}</p>
      </header>
      <div className="space-y-3 text-gray-700">
        {content.intro.map(line => <p key={line}>{line}</p>)}
      </div>
      {content.sections.map(section => (
        <section key={section.title} className="space-y-3">
          <h2 className="text-xl font-semibold text-blue-gray-800">
            <span aria-hidden="true">{section.emoji} </span>{section.title}
          </h2>
          {section.paragraphs.map(line => <p key={line} className="text-gray-700">{line}</p>)}
          {section.bullets && (
            <ul className="list-disc space-y-2 pl-6 text-gray-700">
              {section.bullets.map(line => <li key={line}>{line}</li>)}
            </ul>
          )}
          {section.example && (
            <div className="rounded-lg bg-muted p-4 text-gray-700">
              <p className="font-medium">{section.example.intro}</p>
              <ul className="mt-2 list-disc space-y-1 pl-6">
                {section.example.items.map(line => <li key={line}>{line}</li>)}
              </ul>
            </div>
          )}
          {section.after?.map(line => <p key={line} className="text-gray-700">{line}</p>)}
        </section>
      ))}
      <footer className="space-y-3 border-t pt-6 text-gray-700">
        {content.closing.map(line => <p key={line}>{line}</p>)}
        <p className="font-semibold text-blue-gray-900">{content.signature}</p>
      </footer>
    </article>
  );
}
