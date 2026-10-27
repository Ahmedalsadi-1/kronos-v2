// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import { forwardRef, useImperativeHandle, useState } from 'react';
import type { CursorAvatarHandle } from '../components/CursorAvatar';
import { UpstreamMausAvatar, type MausAvatarProps } from '../components/Avatar';
import { MAUS_COLORS } from '../lib/mascot';
import { MochiCanvas } from './coucou/mochi-canvas';
import type { BotEmote, BotState } from './coucou/bot-engine';
const States: Record<string, BotState> = { curious:'searching', working:'working', writing:'working', thinking:'thinking', searching:'searching', listening:'question', sleeping:'sleeping', drowsy:'sleeping', happy:'finished', proud:'finished', scared:'error', alerting:'approval', notifying:'question' };
export const CoucouAvatar = forwardRef<CursorAvatarHandle, MausAvatarProps>(function CoucouAvatar(props, ref) {
  const [emote,setEmote] = useState<BotEmote>();
  const [expression,setExpression] = useState<number>();
  useImperativeHandle(ref,()=>({blink:()=>setEmote('wink'),spin:()=>setEmote('happy'),setExpression}));
  const size=props.size ?? 44;
  const state=expression == null ? States[props.state ?? 'idle'] ?? 'idle' : ['idle','finished','thinking','sleeping','working'][expression % 5] as BotState;
  if(props.bodyId && props.bodyId !== "cursor") return <UpstreamMausAvatar {...props} ref={ref}/>;
  return <span role={props.label ? 'img' : undefined} aria-label={props.label} style={{display:'inline-flex',width:size,height:size,flexShrink:0}}>
    <MochiCanvas width={size} height={size} appearance="kronterm" bodyColor={MAUS_COLORS[props.color]} state={state} emote={emote ?? ({happy:'happy',curious:'surprised',drowsy:'yawn',suspicious:'annoyed',proud:'proud'} as Record<string,BotEmote>)[props.state ?? '']} animated={props.animated ?? true} lookX={props.gaze?.x} lookY={props.gaze?.y}/>
  </span>;
});
