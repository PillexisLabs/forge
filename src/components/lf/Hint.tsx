import { GLOSSARY, type GlossaryTerm } from './glossary';

// A small "?" after a term. The definition shows on hover, keyboard focus
// or tap, and screen readers read it as the button's description.
export default function Hint({ term, label, align = 'start' }: { term: GlossaryTerm; label: string; align?: 'start' | 'end' }) {
  const id = `hint-${term}`;
  return (
    <span className="hint" data-align={align}>
      <button type="button" className="hint-btn" aria-label={`What is ${label}?`} aria-describedby={id}>?</button>
      <span role="tooltip" id={id} className="hint-tip">{GLOSSARY[term]}</span>
    </span>
  );
}
