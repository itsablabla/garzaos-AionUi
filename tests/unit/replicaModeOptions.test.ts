import { describe, expect, it } from 'vitest';
import { resolveReplicaModeOptions } from '../../src/renderer/pages/guid/hooks/useGuidSend';

describe('resolveReplicaModeOptions', () => {
  it('maps plan mode to Replicas plan mode', () => {
    expect(resolveReplicaModeOptions('plan')).toEqual({ planMode: true });
  });

  it('maps reasoning modes to Replicas thinking levels', () => {
    expect(resolveReplicaModeOptions('low')).toEqual({ thinkingLevel: 'low' });
    expect(resolveReplicaModeOptions('medium')).toEqual({ thinkingLevel: 'medium' });
    expect(resolveReplicaModeOptions('high')).toEqual({ thinkingLevel: 'high' });
    expect(resolveReplicaModeOptions('max')).toEqual({ thinkingLevel: 'max' });
  });

  it('ignores unknown modes', () => {
    expect(resolveReplicaModeOptions('default')).toEqual({});
  });
});
