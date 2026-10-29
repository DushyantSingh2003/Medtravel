import { Module } from '@nestjs/common';
import { OutboxDispatcher } from './outbox-dispatcher.service.js';

@Module({ providers: [OutboxDispatcher], exports: [OutboxDispatcher] })
export class OutboxModule {}
