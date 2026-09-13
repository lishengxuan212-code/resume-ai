import React from 'react';
import { SingleColumnTemplate } from './single-column.js';

export function ClassicTemplate({ resume }) {
  return React.createElement(SingleColumnTemplate, { resume, variant: 'classic' });
}
