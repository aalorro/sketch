import type { StyleRenderFn } from '../types';

import { renderContour } from './contour';
import { renderBlindContour } from './blindcontour';
import { renderGesture } from './gesture';
import { renderLineArt } from './lineart';
import { renderCrossContour } from './crosscontour';
import { renderHatching } from './hatching';
import { renderCrossHatching } from './crosshatching';
import { renderScribble } from './scribble';
import { renderStippling } from './stippling';
import { renderTonalPencil } from './tonalpencil';
import { renderCharcoal } from './charcoal';
import { renderDryBrush } from './drybrush';
import { renderInkWash } from './inkwash';
import { renderComic } from './comic';
import { renderCartoon } from './cartoon';
import { renderSquiggle } from './squiggle';
import { renderFashion } from './fashion';
import { renderUrban } from './urban';
import { renderArchitectural } from './architectural';
import { renderAcademic } from './academic';
import { renderEtching } from './etching';
import { renderMinimalist } from './minimalist';
import { renderGlitch } from './glitch';
import { renderMixedMedia } from './mixedmedia';
import { renderPhotorealism } from './photorealism';
import { renderGraphitePortrait } from './graphiteportrait';
import { renderOilPainting } from './oilpainting';
import { renderWatercolor } from './watercolor';
import { renderDefault } from './default';

export const styleRegistry: Map<string, StyleRenderFn> = new Map([
  ['contour', renderContour],
  ['blindcontour', renderBlindContour],
  ['gesture', renderGesture],
  ['lineart', renderLineArt],
  ['crosscontour', renderCrossContour],
  ['hatching', renderHatching],
  ['crosshatching', renderCrossHatching],
  ['scribble', renderScribble],
  ['stippling', renderStippling],
  ['tonalpencil', renderTonalPencil],
  ['charcoal', renderCharcoal],
  ['drybrush', renderDryBrush],
  ['inkwash', renderInkWash],
  ['comic', renderComic],
  ['cartoon', renderCartoon],
  ['squiggle', renderSquiggle],
  ['fashion', renderFashion],
  ['urban', renderUrban],
  ['architectural', renderArchitectural],
  ['academic', renderAcademic],
  ['etching', renderEtching],
  ['minimalist', renderMinimalist],
  ['glitch', renderGlitch],
  ['mixedmedia', renderMixedMedia],
  ['photorealism', renderPhotorealism],
  ['graphiteportrait', renderGraphitePortrait],
  ['oilpainting', renderOilPainting],
  ['watercolor', renderWatercolor],
  ['default', renderDefault],
]);
