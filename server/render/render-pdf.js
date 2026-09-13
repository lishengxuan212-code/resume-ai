import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { toRenderResume } from '../../shared/resume/to-render-resume.js';
import { getResumeTemplate } from './registry.js';
import { AppError } from '../errors.js';

export async function renderResumePdf({ facts, resume, templateId = 'classic', presentation = {} }) {
  const template = getResumeTemplate(templateId);
  if (!template) throw new AppError(400, 'template_invalid', '请选择可用的简历模板。');
  const renderResume = toRenderResume(facts, resume, presentation);
  return renderToBuffer(React.createElement(template.create, { resume: renderResume }));
}
