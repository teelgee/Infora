/** Clip 04 standalone: ClipOpen (30) + Body standalone + EndCard (90). */
import React from 'react';
import { StandaloneClip } from '../../shared';
import { Body } from './Body';
import { META } from './meta';

export const Standalone: React.FC = () => <StandaloneClip meta={META} Body={Body} />;
