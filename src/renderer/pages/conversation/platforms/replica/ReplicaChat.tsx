/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import RemoteChat from '../remote/RemoteChat';

const ReplicaChat: React.FC<{
  conversation_id: string;
  workspace: string;
  cronJobId?: string;
  hideSendBox?: boolean;
  emptySlot?: React.ReactNode;
}> = (props) => <RemoteChat {...props} type='replica' />;

export default ReplicaChat;
