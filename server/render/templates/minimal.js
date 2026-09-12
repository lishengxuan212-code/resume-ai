import React from 'react';
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { registerResumeFonts } from '../fonts.js';

const h = React.createElement;
const styles = StyleSheet.create({
  page: { paddingTop: 43, paddingBottom: 46, paddingHorizontal: 50, fontFamily: 'ResumeNotoSerifSC', color: '#1e2936', fontSize: 9.3, lineHeight: 1.62 },
  header: { paddingBottom: 18, marginBottom: 13 },
  name: { fontSize: 25, lineHeight: 1.15, color: '#172334', letterSpacing: 0.45 },
  role: { marginTop: 6, color: '#526271', fontSize: 9.8 },
  contact: { marginTop: 9, color: '#65717d', fontSize: 8.3 },
  section: { marginTop: 16 },
  sectionTitle: { fontSize: 11.5, color: '#263d55', letterSpacing: 1.1, borderBottomWidth: 0.8, borderBottomColor: '#9eabb5', paddingBottom: 4, marginBottom: 8 },
  summary: { color: '#394654' },
  entry: { marginBottom: 10, minPresenceAhead: 43 },
  entryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  entryTitle: { fontSize: 10.3, lineHeight: 1.38, flexGrow: 1, color: '#24384b' },
  period: { color: '#6e7b85', fontSize: 8.3, flexShrink: 0 },
  organization: { color: '#61707c', fontSize: 8.5, marginTop: 1 },
  bullet: { flexDirection: 'row', gap: 6, marginTop: 4 },
  bulletMark: { width: 7, color: '#64798c' },
  bulletBody: { flex: 1, color: '#34404b' },
  bulletTitle: { fontSize: 9.3, color: '#263d55' },
  footer: { position: 'absolute', bottom: 20, left: 50, right: 50, color: '#93a0ab', fontSize: 7.2 },
});

function Item({ entry, skills }) {
  return h(View, { style: styles.entry, key: entry.id },
    !skills && (entry.title || entry.period) ? h(View, { style: styles.entryHeader },
      h(Text, { style: styles.entryTitle }, entry.title),
      entry.period ? h(Text, { style: styles.period }, entry.period) : null,
    ) : null,
    !skills && entry.organization ? h(Text, { style: styles.organization }, entry.organization) : null,
    ...entry.bullets.map(bullet => h(View, { style: styles.bullet, key: bullet.id },
      skills ? null : h(Text, { style: styles.bulletMark }, '·'),
      h(Text, { style: styles.bulletBody }, h(Text, { style: styles.bulletTitle }, skills ? `${bullet.title}：` : bullet.title), bullet.text ? (skills ? bullet.text : `　${bullet.text}`) : ''),
    )),
  );
}

function Section({ section }) {
  const skills = section.type === 'skills';
  return h(View, { style: styles.section, key: section.id },
    h(Text, { style: styles.sectionTitle, minPresenceAhead: 31 }, section.title),
    ...section.items.map(entry => h(Item, { entry, skills, key: entry.id })),
  );
}

export function MinimalTemplate({ resume }) {
  registerResumeFonts();
  const bulletCount = resume.sections.reduce((sum, section) => sum + section.items.reduce((entrySum, entry) => entrySum + entry.bullets.length, 0), 0);
  const pageSections = bulletCount > 300 ? resume.sections.map(section => [section]) : [resume.sections];
  return h(Document, { title: `${resume.basics.name || '优化简历'} - ${resume.basics.headline || '简历'}`, author: '简历' },
    ...pageSections.map((sections, index) => h(Page, { size: 'A4', style: styles.page, wrap: true, key: `minimal-page-${index}` },
      index === 0 ? h(View, { style: styles.header },
        resume.basics.name ? h(Text, { style: styles.name }, resume.basics.name) : null,
        resume.basics.headline ? h(Text, { style: styles.role }, resume.basics.headline) : null,
        resume.basics.contactText ? h(Text, { style: styles.contact }, resume.basics.contactText) : null,
      ) : h(View, { style: styles.header }, resume.basics.name ? h(Text, { style: styles.role }, resume.basics.name) : null),
      index === 0 && resume.summary ? h(View, { style: styles.section }, h(Text, { style: styles.sectionTitle, minPresenceAhead: 31 }, '个人概述'), h(Text, { style: styles.summary }, resume.summary)) : null,
      ...sections.map(section => h(Section, { section, key: section.id })),
      h(Text, { style: styles.footer, fixed: true, render: ({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}` }),
    )),
  );
}
