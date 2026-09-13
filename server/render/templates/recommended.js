import React from 'react';
import { SingleColumnTemplate } from './single-column.js';

export function RecommendedTemplate({ resume }) {
  return React.createElement(SingleColumnTemplate, { resume, variant: 'recommended' });
}
