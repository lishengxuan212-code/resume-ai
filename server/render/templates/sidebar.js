import React from 'react';
import { SingleColumnTemplate } from './single-column.js';

export function SidebarTemplate({ resume }) {
  return React.createElement(SingleColumnTemplate, { resume, variant: 'sidebar' });
}
