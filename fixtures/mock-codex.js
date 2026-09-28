#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
const prompt = args.at(-1);
writeFileSync(args[args.indexOf('-o') + 1], prompt.startsWith('You are a silent observer') ? 'The agents are discussing the opening.' : 'I hear you. What should we examine first?');
