#!/usr/bin/env node
/**
 * KingdomOS CLI entry point.
 * Usage: kingdom <command> [options]
 */

import { createProgram } from '../cli.js';

const program = createProgram();
program.parse(process.argv);
