import React from 'react';
import { SingleColumnTemplate } from './single-column.js';

export function MinimalTemplate({ resume }) {
  return React.createElement(SingleColumnTemplate, { resume, variant: 'minimal' });
}
