import { useId, useLayoutEffect, useRef, useState } from 'react';
import { PencilSimple, Check } from '@phosphor-icons/react';

export function RequiredMark() {
  return <span className="required-mark" aria-label="必填">*</span>;
}

export function GrowingTextarea({ value, ...props }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const element = ref.current;
    const resize = () => {
      element.style.height = 'auto';
      element.style.height = `${element.scrollHeight + 2}px`;
    };
    resize();
    let width = element.getBoundingClientRect().width;
    const widthObserver = new ResizeObserver(() => {
      const nextWidth = element.getBoundingClientRect().width;
      if (nextWidth !== width) { width = nextWidth; resize(); }
    });
    widthObserver.observe(element);
    return () => widthObserver.disconnect();
  }, [value]);
  return <textarea {...props} ref={ref} value={value} className="growing-textarea" />;
}

function formattedLines(text, list) {
  const lines = text.split(/\r?\n/);
  if (list) return <ul className="readable-skills">{lines.filter(line => line.trim()).map((line, index) => <li key={index}>{emphasizeLabel(line)}</li>)}</ul>;
  return lines.map((line, index) => {
    if (!line.trim()) return <div className="paragraph-gap" key={index} aria-hidden="true" />;
    const heading = line.match(/^\s*(\d{1,2}[.、．])\s*(.+)$/);
    if (heading) return <p className="numbered-paragraph" key={index}><span className="paragraph-number">{heading[1]}</span><strong>{heading[2]}</strong></p>;
    if (/^\s*[●•]\s*/.test(line)) return <p className="bullet-paragraph" key={index}><span aria-hidden="true">•</span><span>{emphasizeLabel(line.replace(/^\s*[●•]\s*/, ''))}</span></p>;
    if (/^(教育背景|教育经历|工作[／/]?实习经历|工作经历|技能[／/证书及其他]*|专业技能)\s*$/.test(line.trim())) return <p className="text-section-heading" key={index}>{line}</p>;
    return <p key={index}>{emphasizeLabel(line)}</p>;
  });
}

function emphasizeLabel(line) {
  const match = line.match(/^([^：:\n]{2,24}[：:])(.*)$/);
  return match ? <><strong>{match[1]}</strong>{match[2]}</> : line;
}

export function ReadableEditor({ label, value, onChange, required = false, disabled = false, readOnly = false, list = false, maxLength = 12000, placeholder = '还没有内容，点击编辑补充。' }) {
  const [editing, setEditing] = useState(false);
  const id = useId();
  return <div className={`readable-editor ${editing ? 'is-editing' : ''}`}>
    <div className="readable-editor-header">
      <span id={`${id}-label`}>{label}{required && <RequiredMark />}</span>
      {!readOnly && <button type="button" className="editor-toggle" disabled={disabled} aria-label={`${editing ? '完成编辑' : '编辑'}${label}`} aria-expanded={editing} onClick={() => setEditing(!editing)}>
        {editing ? <Check size={15} /> : <PencilSimple size={15} />}{editing ? '完成编辑' : '编辑'}
      </button>}
    </div>
    {editing ? <GrowingTextarea aria-labelledby={`${id}-label`} autoFocus value={value} disabled={disabled} required={required} maxLength={maxLength} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      : <div className="readable-body" role="region" aria-labelledby={`${id}-label`}>{value.trim() ? formattedLines(value, list) : <p className="empty-content">{placeholder}</p>}</div>}
    {!editing && required && !value.trim() && <p className="inline-field-error">请编辑并补充{label}。</p>}
  </div>;
}
