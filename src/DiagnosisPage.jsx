import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, CheckCircle, Lightbulb, Question } from '@phosphor-icons/react';

const safeArray = value => Array.isArray(value) ? value : [];
const normalize = value => String(value ?? '').replace(/\s+/gu, '').toLowerCase();
const unique = values => [...new Set(values.filter(Boolean))];
const annotationSourceIds = item => unique([...safeArray(item?.evidenceSourceIds), ...safeArray(item?.sourceIds)]);

function createResumeBlocks(facts) {
  if (!facts) return [];
  const blocks = [];
  if (facts.name || facts.contact) blocks.push({ id: 'resume-basics', kind: 'basics', eyebrow: '基本资料', title: facts.name || '姓名待补充', meta: facts.contact || '', body: '', sourceIds: [] });
  safeArray(facts.education).forEach((entry, index) => blocks.push({ id: `resume-education-${index}`, kind: 'education', eyebrow: `教育背景 ${String(index + 1).padStart(2, '0')}`, title: [entry.school, entry.major].filter(Boolean).join(' · ') || '教育信息待补充', meta: [entry.degree, entry.dates].filter(Boolean).join(' · '), body: '', sourceIds: safeArray(entry.sourceIds) }));
  safeArray(facts.experiences).forEach((entry, index) => blocks.push({ id: `resume-experience-${index}`, kind: 'experience', eyebrow: `工作经历 ${String(index + 1).padStart(2, '0')}`, title: [entry.organization, entry.title].filter(Boolean).join(' · ') || '经历信息待补充', meta: entry.dates || '', body: entry.description || '', sourceIds: safeArray(entry.sourceIds) }));
  if (safeArray(facts.skills).length) blocks.push({ id: 'resume-skills', kind: 'skills', eyebrow: '技能', title: '已核对的技能材料', meta: '', body: facts.skills.join('\n'), sourceIds: safeArray(facts.sourceBlocks).filter(block => /^review-skills$/u.test(block.id)).map(block => block.id) });
  if (!blocks.length) safeArray(facts.sourceBlocks).slice(0, 12).forEach((block, index) => blocks.push({ id: `resume-source-${index}`, kind: 'source', eyebrow: block.page ? `来源原文 · 第 ${block.page} 页` : '来源原文', title: `材料片段 ${index + 1}`, meta: '', body: block.text || '', sourceIds: [block.id] }));
  return blocks.map((block, index) => ({ ...block, order: index, lines: block.body ? block.body.split(/\r?\n/u) : [] }));
}

function quotedPhrases(value) {
  const matches = [];
  for (const match of String(value ?? '').matchAll(/[“「『"]([^”」』"]{2,120})[”」』"]/gu)) matches.push(match[1]);
  return unique(matches);
}

function compactWithMap(value) {
  let compact = '';
  const map = [];
  Array.from(String(value ?? '')).forEach((character, index) => {
    if (!/\s/u.test(character)) {
      compact += character.toLowerCase();
      map.push(index);
    }
  });
  return { compact, map };
}

function exactRange(text, phrase) {
  const haystack = compactWithMap(text);
  const needle = normalize(phrase);
  const compactIndex = needle ? haystack.compact.indexOf(needle) : -1;
  if (compactIndex < 0) return null;
  return { start: haystack.map[compactIndex], end: haystack.map[compactIndex + needle.length - 1] + 1 };
}

function longestSharedLength(left, right) {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return 0;
  const previous = new Uint16Array(b.length + 1);
  let best = 0;
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = 0;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j];
      previous[j] = a[i - 1] === b[j - 1] ? diagonal + 1 : 0;
      if (previous[j] > best) best = previous[j];
      diagonal = above;
    }
  }
  return best;
}

function anchorAnnotation(item, blocks) {
  const sourceIds = annotationSourceIds(item);
  const issueText = `${item.issue || ''} ${item.question || ''} ${item.suggestedAction || ''}`;
  const phrases = quotedPhrases(issueText).sort((left, right) => normalize(right).length - normalize(left).length);
  const candidates = [];

  blocks.forEach(block => {
    const hasSharedSource = block.sourceIds.some(id => sourceIds.includes(id));
    [{ field: 'title', text: block.title }, { field: 'meta', text: block.meta }].forEach(header => {
      for (const phrase of phrases) {
        const range = exactRange(header.text, phrase);
        if (range) candidates.push({ block, blockIndex: block.order, zone: 'header', field: header.field, lineIndex: -1, range, precise: true, score: 500 + normalize(phrase).length });
      }
      const sharedLength = longestSharedLength(header.text, issueText);
      if (sharedLength >= 12 || (hasSharedSource && sharedLength >= 8)) candidates.push({ block, blockIndex: block.order, zone: 'header', field: header.field, lineIndex: -1, range: null, precise: false, score: 80 + sharedLength });
    });
    block.lines.forEach((line, lineIndex) => {
      for (const phrase of phrases) {
        const range = exactRange(line, phrase);
        if (range) candidates.push({ block, blockIndex: block.order, zone: 'body', lineIndex, range, precise: true, score: 600 + normalize(phrase).length });
      }
      const sharedLength = longestSharedLength(line, issueText);
      if (sharedLength >= 12 || (hasSharedSource && sharedLength >= 8)) candidates.push({ block, blockIndex: block.order, zone: 'body', lineIndex, range: null, precise: false, score: 100 + sharedLength });
    });
  });

  candidates.sort((left, right) => right.score - left.score || left.blockIndex - right.blockIndex || left.lineIndex - right.lineIndex);
  return candidates[0] || null;
}

function linkQuestions(findings, questions) {
  const linked = new Map(findings.map(item => [item.id, []]));
  const standalone = [];
  questions.forEach(question => {
    const questionSources = annotationSourceIds(question);
    const questionRules = safeArray(question.ruleIds);
    const ranked = findings.map(finding => {
      const sharedSources = annotationSourceIds(finding).filter(id => questionSources.includes(id)).length;
      const sharedRules = safeArray(finding.ruleIds).filter(id => questionRules.includes(id)).length;
      const sharedText = longestSharedLength(`${question.question} ${question.reason}`, `${finding.issue} ${finding.suggestedAction}`);
      return { finding, score: sharedSources * 10 + sharedRules * 3 + Math.min(sharedText, 20) };
    }).sort((left, right) => right.score - left.score);
    if (ranked[0]?.score > 0) linked.get(ranked[0].finding.id).push(question);
    else standalone.push(question);
  });
  return { linked, standalone };
}

function annotationPosition(item) {
  if (!item.anchor) return -100000 + item.originalIndex;
  const zone = item.anchor.zone === 'header' ? 0 : item.anchor.lineIndex + 1;
  return item.anchor.blockIndex * 1000 + zone * 10 + item.originalIndex / 100;
}

function PinButtons({ items, activeId, onChoose }) {
  if (!items.length) return null;
  return <span className="inline-annotation-markers">{items.map(item => <button id={`source-${item.id}`} key={item.id} type="button" className={`annotation-pin ${activeId === item.id ? 'is-active' : ''}`} aria-label={`查看批注 ${item.number}`} onClick={event => { event.stopPropagation(); onChoose(item.id, 'comment'); }}>{item.number}</button>)}</span>;
}

function AnnotatedText({ text, annotations, activeId, onChoose }) {
  if (!text) return null;
  const precise = annotations.filter(item => item.anchor?.precise && item.anchor.range).sort((left, right) => left.anchor.range.start - right.anchor.range.start);
  const groups = [];
  precise.forEach(item => {
    const range = item.anchor.range;
    const last = groups.at(-1);
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
      last.items.push(item);
    } else groups.push({ start: range.start, end: range.end, items: [item] });
  });
  const nodes = [];
  let cursor = 0;
  groups.forEach((group, index) => {
    if (group.start > cursor) nodes.push(text.slice(cursor, group.start));
    nodes.push(<mark className={group.items.some(item => item.id === activeId) ? 'is-active' : ''} key={`${group.start}-${index}`}>{text.slice(group.start, group.end)}<PinButtons items={group.items} activeId={activeId} onChoose={onChoose} /></mark>);
    cursor = Math.max(cursor, group.end);
  });
  if (cursor < text.length) nodes.push(text.slice(cursor));
  const approximate = annotations.filter(item => !item.anchor?.precise);
  if (approximate.length) nodes.push(<PinButtons key="approximate" items={approximate} activeId={activeId} onChoose={onChoose} />);
  return <>{nodes}</>;
}

function QuestionEditor({ item, index, value, busy, onChange }) {
  return <div className="annotation-question"><span><Question size={15} />需要你确认 {index + 1}</span><strong>{item.question}</strong><small>{item.reason}</small><div className="diagnosis-suggestion"><span><Lightbulb size={15} />建议表达方向</span><p>{item.suggestedRewrite}</p><button type="button" disabled={busy} onClick={() => onChange(item.suggestedRewrite)}>采用这个方向</button></div><label><span className="visually-hidden">问题 {index + 1} 的回答</span><textarea value={value} disabled={busy} maxLength={3000} placeholder="补充真实情况；不确定可以留空。" onChange={event => onChange(event.target.value)} /></label></div>;
}

export function DiagnosisPage({ diagnosis, facts, busy, statusText, error, optimizationUnavailable, optimizationMessage, onBack, onOptimize }) {
  const heading = useRef(null);
  const commentList = useRef(null);
  const [answers, setAnswers] = useState(() => Object.fromEntries(diagnosis.questions.map(item => [item.id, ''])));
  const blocks = useMemo(() => createResumeBlocks(facts), [facts]);
  const findings = useMemo(() => diagnosis.findings.map((item, index) => ({ ...item, id: `finding-${index + 1}`, originalIndex: index })), [diagnosis.findings]);
  const questionLinks = useMemo(() => linkQuestions(findings, diagnosis.questions), [findings, diagnosis.questions]);
  const annotations = useMemo(() => {
    const findingAnnotations = findings.map(item => ({ ...item, anchor: anchorAnnotation(item, blocks), questions: questionLinks.linked.get(item.id) || [] }));
    const standalone = questionLinks.standalone.map((item, index) => ({ ...item, id: `question-${item.id}`, originalIndex: findings.length + index, issue: item.question, suggestedAction: item.suggestedRewrite, anchor: anchorAnnotation(item, blocks), questions: [item], questionOnly: true }));
    return [...findingAnnotations, ...standalone].sort((left, right) => annotationPosition(left) - annotationPosition(right)).map((item, index) => ({ ...item, number: index + 1 }));
  }, [blocks, findings, questionLinks]);
  const [activeId, setActiveId] = useState(annotations[0]?.id || '');
  useEffect(() => { window.scrollTo(0, 0); heading.current?.focus({ preventScroll: true }); }, []);
  const answered = diagnosis.questions.flatMap(item => answers[item.id]?.trim() ? [{ questionId: item.id, answer: answers[item.id].trim() }] : []);
  const chooseAnnotation = (id, destination) => {
    setActiveId(id);
    const targetId = destination === 'source' ? `source-${id}` : `comment-${id}`;
    window.requestAnimationFrame(() => {
      const target = document.getElementById(targetId);
      if (!target) return;
      if (destination === 'comment' && commentList.current) {
        const container = commentList.current;
        const targetTop = container.scrollTop + target.getBoundingClientRect().top - container.getBoundingClientRect().top;
        container.scrollTo({ top: Math.max(0, targetTop - 16), behavior: 'smooth' });
        return;
      }
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };
  const markersFor = (blockId, zone, lineIndex = -1, field = null) => annotations.filter(item => item.anchor?.block.id === blockId && item.anchor.zone === zone && item.anchor.lineIndex === lineIndex && (zone !== 'header' || item.anchor.field === field));
  const unanchored = annotations.filter(item => !item.anchor);
  return <div className="review-page diagnosis-page">
    <header className="review-topbar"><div className="review-brand"><span className="wordmark">简历</span><span className="breadcrumb-divider">/</span><span>材料批注</span></div><button className="back-link" type="button" onClick={onBack}><ArrowLeft size={17} />返回修改材料</button></header>
    <div className="review-intro diagnosis-intro"><div><p className="eyebrow">方法论版本 {diagnosis.methodologyVersion}</p><h1 ref={heading} tabIndex={-1}>问题已经标在材料旁边</h1><p>编号会按简历从上到下排列，并贴在对应文字后面；需要补充的事实可以直接在批注中回答。</p></div><div className="annotation-legend"><span><i className="is-issue" />原文批注</span><span><i className="is-general" />整体批注</span></div></div>
    <main className="diagnosis-workspace">
      <section className="annotation-shell" aria-label="简历材料批注">
        <div className="annotated-resume"><div className="annotated-resume-head"><div><p className="finding-dimension">已核对材料</p><h2>简历内容</h2></div><span>{annotations.length} 条批注</span></div>
          {!annotations.length && <p className="empty-section"><CheckCircle size={18} />现有材料没有发现必须补充的问题，可以直接优化。</p>}
          {!!unanchored.length && <div className="resume-general-note"><strong>整体批注</strong><p>以下问题影响整体表达，但不能可靠定位到某一句原文。</p><div>{unanchored.map(item => <button type="button" className={activeId === item.id ? 'is-active' : ''} key={item.id} onClick={() => chooseAnnotation(item.id, 'comment')}><span>{item.number}</span>{item.dimension || '整体材料'}</button>)}</div></div>}
          <div className="resume-paper">{blocks.map(block => {
            const blockMarkers = annotations.filter(item => item.anchor?.block.id === block.id);
            const titleMarkers = markersFor(block.id, 'header', -1, 'title');
            const metaMarkers = markersFor(block.id, 'header', -1, 'meta');
            return <article id={`block-${block.id}`} className={`resume-annotation-block ${blockMarkers.some(item => item.id === activeId) ? 'is-active' : ''}`} key={block.id}><div className="resume-block-copy"><p>{block.eyebrow}</p><h3><AnnotatedText text={block.title} annotations={titleMarkers} activeId={activeId} onChoose={chooseAnnotation} /></h3>{block.meta && <small><AnnotatedText text={block.meta} annotations={metaMarkers} activeId={activeId} onChoose={chooseAnnotation} /></small>}{!!block.lines.length && <div className="resume-block-body">{block.lines.map((line, lineIndex) => <div className="resume-body-line" key={`${block.id}-${lineIndex}`}><AnnotatedText text={line || ' '} annotations={markersFor(block.id, 'body', lineIndex)} activeId={activeId} onChoose={chooseAnnotation} /></div>)}</div>}</div></article>;
          })}</div>
        </div>
        <aside className="annotation-rail" aria-label="修改批注"><div className="annotation-rail-head"><p className="finding-dimension">批注</p><h2>问题与修改方向</h2><span>建议不是最终文案，仍需结合真实事实。</span></div><div className="annotation-comments" ref={commentList}>{annotations.map(item => <article id={`comment-${item.id}`} className={`annotation-comment ${activeId === item.id ? 'is-active' : ''}`} key={item.id} onClick={() => setActiveId(item.id)}><div className="annotation-comment-title"><span>{item.number}</span><p>{item.dimension || (item.questionOnly ? '事实确认' : '材料表达')}</p>{item.anchor?.precise ? <small>已定位原句</small> : item.anchor ? <small>已定位本行</small> : <small>整体问题</small>}</div>{!item.questionOnly && <><h3>{item.issue}</h3><div className="annotation-change"><span>建议怎么改</span><p>{item.suggestedAction}</p></div></>}{item.questions.map(question => <QuestionEditor key={question.id} item={question} index={diagnosis.questions.findIndex(candidate => candidate.id === question.id)} value={answers[question.id] || ''} busy={busy} onChange={value => setAnswers(current => ({ ...current, [question.id]: value }))} />)}{item.anchor && <button className="annotation-locate" type="button" onClick={() => chooseAnnotation(item.id, 'source')}>查看原文位置</button>}</article>)}</div></aside>
      </section>
      <section className="diagnosis-actions" aria-busy={busy}><p className={error ? 'error' : 'processing-status'}>{error || optimizationMessage || statusText}</p><div><button className="button secondary" disabled={busy || optimizationUnavailable} onClick={() => onOptimize([], true)}>跳过批注，按现有材料优化</button><button className="button primary" disabled={busy || optimizationUnavailable} onClick={() => onOptimize(answered, false)}>{busy ? '正在优化简历…' : '使用补充事实优化'}<ArrowUpRight size={18} /></button></div></section>
    </main>
  </div>;
}
