import React from 'react';
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { registerResumeFonts } from '../fonts.js';

const h = React.createElement;
const variants = {
  recommended: { pagePadding: 44, sectionGap: 13, entryGap: 10, bodySize: 9.7, titleSize: 13, fontFamily: 'ResumeReferenceSans', avatarSize: 76, pageNumbers: false },
  classic: { pagePadding: 45, sectionGap: 13, entryGap: 9, bodySize: 10, titleSize: 12, fontFamily: 'ResumeSongti', avatarSize: 58, pageNumbers: true },
  minimal: { pagePadding: 49, sectionGap: 16, entryGap: 11, bodySize: 10, titleSize: 12, fontFamily: 'ResumeSongti', avatarSize: 54, pageNumbers: true },
  sidebar: { pagePadding: 42, sectionGap: 11, entryGap: 8, bodySize: 9.7, titleSize: 11.6, fontFamily: 'ResumeSongti', avatarSize: 52, pageNumbers: true },
};

function buildStyles(variant) {
  const settings = variants[variant] ?? variants.recommended;
  return StyleSheet.create({
    page: { paddingTop: settings.pagePadding, paddingBottom: settings.pagePadding, paddingHorizontal: settings.pagePadding, fontFamily: settings.fontFamily, color: '#000000', fontSize: settings.bodySize, lineHeight: 1.58, backgroundColor: '#ffffff' },
    header: { flexDirection: 'row', alignItems: 'flex-start', paddingBottom: 7 },
    avatar: { width: settings.avatarSize, height: settings.avatarSize, borderRadius: 0, objectFit: 'cover', marginLeft: 20 },
    identity: { flex: 1, minWidth: 0 },
    name: { fontSize: 21, lineHeight: 1.18, fontWeight: 700 },
    role: { marginTop: 3, fontSize: 10.2, fontWeight: 700 },
    contact: { marginTop: 7, fontSize: 9.2, lineHeight: 1.45 },
    education: { marginTop: 4, marginBottom: 3 },
    educationTitle: { fontSize: settings.titleSize, lineHeight: 1.35, fontWeight: 700, borderBottomWidth: 0.9, borderBottomColor: '#000000', paddingBottom: 3, marginBottom: 6 },
    educationRow: { flexDirection: 'row', gap: 12, marginBottom: 4 },
    educationSchool: { flex: 1.55, fontWeight: 700, lineHeight: 1.4 },
    educationDegree: { flex: 0.8, fontWeight: 700, lineHeight: 1.4 },
    educationPeriod: { flex: 0.95, fontWeight: 700, lineHeight: 1.4, textAlign: 'right' },
    educationDetail: { marginTop: 1, lineHeight: 1.5 },
    section: { marginTop: settings.sectionGap },
    sectionTitle: { fontSize: settings.titleSize, lineHeight: 1.35, fontWeight: 700, borderBottomWidth: 0.9, borderBottomColor: '#000000', paddingBottom: 3, marginBottom: 7 },
    summary: { fontSize: settings.bodySize, lineHeight: 1.62 },
    entry: { marginBottom: settings.entryGap, minPresenceAhead: 48 },
    separatedEntry: { borderTopWidth: 1.15, borderTopColor: '#000000', paddingTop: 10, marginTop: 12 },
    entryHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 12, marginBottom: 1 },
    entryTitle: { flexGrow: 1, flexShrink: 1, minWidth: 0, fontSize: settings.bodySize + 0.4, lineHeight: 1.4, fontWeight: 700 },
    period: { flexShrink: 0, fontSize: settings.bodySize - 1.1 },
    organization: { fontSize: settings.bodySize - 0.8, marginBottom: 2 },
    bullet: { marginTop: 3, width: '100%', flexShrink: 1, minWidth: 0, fontSize: settings.bodySize, lineHeight: 1.62 },
    bulletTitle: { fontWeight: 700 },
    skill: { marginTop: 3, width: '100%', flexShrink: 1, minWidth: 0, fontSize: settings.bodySize, lineHeight: 1.62 },
    footer: { position: 'absolute', bottom: 18, right: settings.pagePadding, color: '#555555', fontSize: 7.5 },
  });
}

function Bullet({ bullet, skills, styles }) {
  return h(Text, { style: skills ? styles.skill : styles.bullet, key: bullet.id, wrap: true },
    skills ? '' : '•　',
    h(Text, { style: styles.bulletTitle }, `${bullet.title}${skills ? '：' : '　'}`),
    bullet.text,
  );
}

function ResumeEntry({ entry, skills, styles, separated }) {
  return h(View, { style: separated ? [styles.entry, styles.separatedEntry] : styles.entry, key: entry.id, wrap: true },
    !skills && (entry.title || entry.period) ? h(View, { style: styles.entryHeader },
      h(Text, { style: styles.entryTitle, wrap: true }, entry.title),
      entry.period ? h(Text, { style: styles.period }, entry.period) : null,
    ) : null,
    !skills && entry.organization ? h(Text, { style: styles.organization, wrap: true }, entry.organization) : null,
    ...entry.bullets.map(bullet => h(Bullet, { bullet, skills, styles, key: bullet.id })),
  );
}

function ResumeSection({ section, styles }) {
  const skills = section.type === 'skills';
  return h(View, { style: styles.section, key: section.id, wrap: true },
    h(Text, { style: styles.sectionTitle, minPresenceAhead: 34 }, section.title),
    ...section.items.map((entry, index) => h(ResumeEntry, { entry, skills, styles, separated: !skills && index > 0, key: entry.id })),
  );
}

function Education({ items, styles }) {
  if (!items.length) return null;
  return h(View, { style: styles.education, wrap: true },
    h(Text, { style: styles.educationTitle, minPresenceAhead: 30 }, '教育背景'),
    ...items.map(item => h(View, { style: styles.educationRow, key: item.id, wrap: true },
      h(Text, { style: styles.educationSchool }, [item.school, item.major].filter(Boolean).join(' — ')),
      h(Text, { style: styles.educationDegree }, item.degree),
      h(Text, { style: styles.educationPeriod }, item.period),
    )),
  );
}

export function SingleColumnTemplate({ resume, variant = 'recommended' }) {
  registerResumeFonts();
  const styles = buildStyles(variant);
  const settings = variants[variant] ?? variants.recommended;
  const bulletCount = resume.sections.reduce((count, section) => count + section.items.reduce((entryCount, entry) => entryCount + entry.bullets.length, 0), 0);
  const pageSections = bulletCount > 300 ? resume.sections.map(section => [section]) : [resume.sections];
  return h(Document, { title: `${resume.basics.name || '优化简历'} - ${resume.basics.headline || '简历'}`, author: '简历' },
    ...pageSections.map((sections, index) => h(Page, { size: 'A4', style: styles.page, wrap: true, key: `page-${variant}-${index}` },
      h(View, { style: styles.header },
        h(View, { style: styles.identity },
          resume.basics.name ? h(Text, { style: styles.name }, resume.basics.name) : null,
          resume.basics.headline ? h(Text, { style: styles.role }, resume.basics.headline) : null,
          resume.basics.contactText ? h(Text, { style: styles.contact, wrap: true }, resume.basics.contactText) : null,
        ),
        index === 0 && resume.basics.avatarDataUrl ? h(Image, { style: styles.avatar, src: resume.basics.avatarDataUrl }) : null,
      ),
      index === 0 ? h(Education, { items: resume.basics.education, styles }) : null,
      index === 0 && resume.summary ? h(View, { style: styles.section }, h(Text, { style: styles.sectionTitle, minPresenceAhead: 34 }, '个人概述'), h(Text, { style: styles.summary, wrap: true }, resume.summary)) : null,
      ...sections.map(section => h(ResumeSection, { section, styles, key: section.id })),
      settings.pageNumbers ? h(Text, { style: styles.footer, fixed: true, render: ({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}` }) : null,
    )),
  );
}
