import React from 'react';
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { registerResumeFonts } from '../fonts.js';

const h = React.createElement;
const styles = StyleSheet.create({
  page: { paddingTop: 45, paddingBottom: 48, paddingHorizontal: 48, fontFamily: 'ResumeNotoSerifSC', color: '#171717', fontSize: 9.5, lineHeight: 1.65 },
  header: { borderBottomWidth: 1, borderBottomColor: '#1f1f1f', paddingBottom: 14, marginBottom: 18 },
  name: { fontSize: 23, lineHeight: 1.2, letterSpacing: 0.3 },
  role: { marginTop: 5, color: '#4a4a4a', fontSize: 10.5 },
  contact: { marginTop: 6, color: '#535353', fontSize: 8.8 },
  section: { marginTop: 15 },
  sectionTitle: { fontSize: 12, lineHeight: 1.25, borderBottomWidth: 0.7, borderBottomColor: '#6d6d6d', paddingBottom: 4, marginBottom: 8 },
  summary: { color: '#303030' },
  entry: { marginBottom: 10, minPresenceAhead: 44 },
  entryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  entryTitle: { fontSize: 10.5, lineHeight: 1.4, flexGrow: 1 },
  period: { color: '#555', fontSize: 8.6, flexShrink: 0 },
  organization: { color: '#555', fontSize: 8.8, marginTop: 1 },
  bullet: { flexDirection: 'row', gap: 5, marginTop: 4 },
  bulletMark: { width: 8, color: '#555' },
  bulletBody: { flex: 1, color: '#2b2b2b' },
  bulletTitle: { fontSize: 9.5 },
  footer: { position: 'absolute', bottom: 20, left: 48, right: 48, textAlign: 'right', color: '#858585', fontSize: 7.5 },
});

function Bullet({ bullet, skills }) {
  const content = skills
    ? h(Text, { style: styles.bulletBody }, h(Text, { style: styles.bulletTitle }, `${bullet.title}：`), bullet.text)
    : h(Text, { style: styles.bulletBody }, h(Text, { style: styles.bulletTitle }, bullet.title), bullet.text ? `　${bullet.text}` : '');
  return h(View, { style: styles.bullet, key: bullet.id }, skills ? null : h(Text, { style: styles.bulletMark }, '•'), content);
}

function ResumeEntry({ entry, skills }) {
  const metadata = [entry.organization, entry.period].filter(Boolean).join('　·　');
  return h(View, { style: styles.entry, key: entry.id },
    !skills && (entry.title || entry.period) ? h(View, { style: styles.entryHeader },
      h(Text, { style: styles.entryTitle }, entry.title),
      entry.period ? h(Text, { style: styles.period }, entry.period) : null,
    ) : null,
    !skills && metadata && entry.organization ? h(Text, { style: styles.organization }, entry.organization) : null,
    ...entry.bullets.map(bullet => h(Bullet, { bullet, skills, key: bullet.id })),
  );
}

function ResumeSection({ section }) {
  const skills = section.type === 'skills';
  return h(View, { style: styles.section, key: section.id },
    h(Text, { style: styles.sectionTitle, minPresenceAhead: 32 }, section.title),
    ...section.items.map(entry => h(ResumeEntry, { entry, skills, key: entry.id })),
  );
}

export function ClassicTemplate({ resume }) {
  registerResumeFonts();
  const bulletCount = resume.sections.reduce((count, section) => count + section.items.reduce((itemCount, item) => itemCount + item.bullets.length, 0), 0);
  // React PDF's layout tree becomes numerically unstable for unusually large
  // resumes. Normal resumes share one flowing root page; extreme imports use
  // section roots so each renderer tree remains bounded and readable.
  const pageSections = bulletCount > 300 ? resume.sections.map(section => [section]) : [resume.sections];
  return h(Document, { title: `${resume.basics.name || '优化简历'} - ${resume.basics.headline || '简历'}`, author: '简历' },
    ...pageSections.map((sections, index) => h(Page, { size: 'A4', style: styles.page, wrap: true, key: `page-root-${index}` },
      index === 0 ? h(View, { style: styles.header },
        resume.basics.name ? h(Text, { style: styles.name }, resume.basics.name) : null,
        resume.basics.headline ? h(Text, { style: styles.role }, resume.basics.headline) : null,
        resume.basics.contactText ? h(Text, { style: styles.contact }, resume.basics.contactText) : null,
      ) : h(View, { style: styles.header }, resume.basics.name ? h(Text, { style: styles.role }, resume.basics.name) : null),
      index === 0 && resume.summary ? h(View, { style: styles.section }, h(Text, { style: styles.sectionTitle, minPresenceAhead: 32 }, '个人概述'), h(Text, { style: styles.summary }, resume.summary)) : null,
      ...sections.map(section => h(ResumeSection, { section, key: section.id })),
      h(Text, { style: styles.footer, fixed: true, render: ({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}` }),
    )),
  );
}
