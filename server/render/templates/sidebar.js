import React from 'react';
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { registerResumeFonts } from '../fonts.js';

const h = React.createElement;
const styles = StyleSheet.create({
  page: { fontFamily: 'ResumeNotoSerifSC', color: '#202020', fontSize: 9.1, lineHeight: 1.62 },
  sidebar: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 182, paddingTop: 47, paddingHorizontal: 22, backgroundColor: '#252729', color: '#f3f1ec' },
  sidebarName: { fontSize: 19, lineHeight: 1.25, letterSpacing: 0.2 },
  sidebarRole: { marginTop: 7, color: '#cac8c2', fontSize: 8.8, lineHeight: 1.55 },
  sidebarContact: { marginTop: 16, paddingTop: 12, borderTopWidth: 0.7, borderTopColor: '#787873', color: '#d9d7d1', fontSize: 7.8, lineHeight: 1.72 },
  sidebarSection: { marginTop: 22 },
  sidebarTitle: { color: '#d9d3c8', fontSize: 9.2, letterSpacing: 0.9, marginBottom: 8 },
  sidebarSkill: { color: '#f0eee8', fontSize: 8, marginBottom: 6, lineHeight: 1.65 },
  main: { marginLeft: 182, paddingTop: 47, paddingRight: 47, paddingBottom: 48, paddingLeft: 34 },
  continuation: { marginBottom: 10, color: '#77736c', fontSize: 8.5 },
  section: { marginTop: 17 },
  sectionTitle: { fontSize: 12, color: '#2b2d2e', borderBottomWidth: 1.2, borderBottomColor: '#292b2c', paddingBottom: 4, marginBottom: 8 },
  summary: { color: '#404143' },
  entry: { marginBottom: 10, minPresenceAhead: 43 },
  entryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 },
  entryTitle: { fontSize: 10.1, flexGrow: 1, color: '#262829' },
  period: { color: '#71716d', fontSize: 8.1, flexShrink: 0 },
  organization: { color: '#6d6c67', fontSize: 8.4, marginTop: 1 },
  bullet: { flexDirection: 'row', gap: 5, marginTop: 4 },
  bulletMark: { width: 7, color: '#696864' },
  bulletBody: { flex: 1, color: '#393a39' },
  bulletTitle: { fontSize: 9.1, color: '#292b2c' },
  footer: { position: 'absolute', bottom: 20, right: 47, color: '#898681', fontSize: 7.2 },
});

function Sidebar({ resume }) {
  const skills = resume.sections.filter(section => section.type === 'skills');
  return h(View, { style: styles.sidebar, fixed: true },
    resume.basics.name ? h(Text, { style: styles.sidebarName }, resume.basics.name) : null,
    resume.basics.headline ? h(Text, { style: styles.sidebarRole }, resume.basics.headline) : null,
    resume.basics.contactText ? h(Text, { style: styles.sidebarContact }, resume.basics.contactText) : null,
    ...skills.map(section => h(View, { style: styles.sidebarSection, key: section.id },
      h(Text, { style: styles.sidebarTitle }, section.title),
      ...section.items.flatMap(entry => entry.bullets).map(bullet => h(Text, { style: styles.sidebarSkill, key: bullet.id }, h(Text, null, `${bullet.title}：`), bullet.text)),
    )),
  );
}

function Section({ section }) {
  return h(View, { style: styles.section, key: section.id },
    h(Text, { style: styles.sectionTitle, minPresenceAhead: 31 }, section.title),
    ...section.items.map(entry => h(View, { style: styles.entry, key: entry.id },
      h(View, { style: styles.entryHeader }, h(Text, { style: styles.entryTitle }, entry.title), entry.period ? h(Text, { style: styles.period }, entry.period) : null),
      entry.organization ? h(Text, { style: styles.organization }, entry.organization) : null,
      ...entry.bullets.map(bullet => h(View, { style: styles.bullet, key: bullet.id }, h(Text, { style: styles.bulletMark }, '•'), h(Text, { style: styles.bulletBody }, h(Text, { style: styles.bulletTitle }, bullet.title), bullet.text ? `　${bullet.text}` : ''))),
    )),
  );
}

export function SidebarTemplate({ resume }) {
  registerResumeFonts();
  const mainSections = resume.sections.filter(section => section.type !== 'skills');
  const bulletCount = mainSections.reduce((sum, section) => sum + section.items.reduce((entrySum, entry) => entrySum + entry.bullets.length, 0), 0);
  const pageSections = bulletCount > 300 ? mainSections.map(section => [section]) : [mainSections];
  return h(Document, { title: `${resume.basics.name || '优化简历'} - ${resume.basics.headline || '简历'}`, author: '简历' },
    ...pageSections.map((sections, index) => h(Page, { size: 'A4', style: styles.page, wrap: true, key: `sidebar-page-${index}` },
      h(Sidebar, { resume }),
      h(View, { style: styles.main },
        index > 0 && resume.basics.name ? h(Text, { style: styles.continuation }, resume.basics.name) : null,
        index === 0 && resume.summary ? h(View, { style: styles.section }, h(Text, { style: styles.sectionTitle, minPresenceAhead: 31 }, '个人概述'), h(Text, { style: styles.summary }, resume.summary)) : null,
        ...sections.map(section => h(Section, { section, key: section.id })),
      ),
      h(Text, { style: styles.footer, fixed: true, render: ({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}` }),
    )),
  );
}
