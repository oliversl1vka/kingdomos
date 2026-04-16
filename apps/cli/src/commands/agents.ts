/**
 * `kingdom agents` command group.
 *
 * Subcommands:
 *   kingdom agents list           — list agent roles and capability requirements
 *   kingdom agents route <role>   — show which model would be selected for a role
 */

import { Command } from 'commander';
import { registry, PolicyEngine } from '@kingdomos/core';
import type { AgentRole, TaskRequirements } from '@kingdomos/core';

const ROLE_REQUIREMENTS: Record<AgentRole, TaskRequirements & { description: string }> = {
  monarch: {
    description: 'Top-level orchestrator — needs strong planning and tool use',
    minReasoningDepth: 4,
    requiresToolCalling: true,
    requiresStructuredOutput: true,
    minContextWindow: 16384,
    minReliability: 0.92,
  },
  herald: {
    description: 'Task decomposer — needs structured output',
    minReasoningDepth: 3,
    requiresStructuredOutput: true,
    requiresToolCalling: true,
    minContextWindow: 8192,
    minReliability: 0.9,
  },
  knight: {
    description: 'Code executor — needs tool calling',
    minReasoningDepth: 3,
    requiresToolCalling: true,
    minContextWindow: 8192,
  },
  scribe: {
    description: 'Document / note-taking — light model, no special caps',
    minReasoningDepth: 2,
    minContextWindow: 4096,
  },
  sentinel: {
    description: 'Health monitor — structured output, low latency',
    requiresStructuredOutput: true,
    maxLatencyP50Ms: 1000,
    minContextWindow: 4096,
  },
  alchemist: {
    description: 'Tool/API caller — needs reliable tool calling',
    requiresToolCalling: true,
    requiresStructuredOutput: true,
    minReliability: 0.91,
    minContextWindow: 8192,
  },
  sage: {
    description: 'Long-context reasoning — needs large context window',
    minReasoningDepth: 4,
    requiresLongContextRetrieval: true,
    minContextWindow: 64000,
  },
};

export function registerAgentsCommand(program: Command): void {
  const cmd = program.command('agents').description('Agent roles and routing');

  cmd
    .command('list')
    .description('List all agent roles and their capability requirements')
    .action(() => {
      console.log('\nAgent roles:\n');
      for (const [role, req] of Object.entries(ROLE_REQUIREMENTS)) {
        const { description, ...caps } = req;
        console.log(`  ${role.padEnd(12)} ${description}`);
        console.log(`             ${ JSON.stringify(caps) }\n`);
      }
    });

  cmd
    .command('route <role>')
    .description('Show which model would be selected for an agent role')
    .option('--sort <by>', 'Sort strategy: reliability | latency | cost', 'reliability')
    .action(async (role: string, opts: { sort: string }) => {
      if (!(role in ROLE_REQUIREMENTS)) {
        console.error(`Unknown role '${role}'. Valid roles: ${Object.keys(ROLE_REQUIREMENTS).join(', ')}`);
        process.exit(1);
      }

      // Best-effort registry bootstrap from LM Studio
      try {
        const { LMStudioProvider } = await import('@kingdomos/providers');
        const lmStudio = new LMStudioProvider();
        if (await lmStudio.isAvailable()) {
          registry.registerProvider(lmStudio);
          const models = await lmStudio.listModels();
          for (const modelId of models) {
            const caps = await lmStudio.getCapabilities(modelId);
            if (!caps) continue;
            const entryId = `lm-studio/${modelId}`;
            if (!registry.getEntry(entryId)) {
              registry.register({ id: entryId, displayName: modelId, providerId: 'lm-studio', providerModelId: modelId, capabilities: caps, featureFlags: {}, enabled: true });
            }
          }
        }
      } catch {
        // ignore — offline
      }

      const engine = new PolicyEngine(registry);
      const { description: _, ...requirements } = ROLE_REQUIREMENTS[role as AgentRole];

      try {
        const decision = engine.route(requirements, opts.sort as 'reliability' | 'latency' | 'cost');
        console.log(`\nBest model for role '${role}':\n`);
        console.log(`  Model   : ${decision.modelEntry.id}`);
        console.log(`  Provider: ${decision.providerId}`);
        console.log(`  Reason  : ${decision.reason}`);
        console.log(`  Caps    : ctx=${decision.modelEntry.capabilities.contextWindow}, tools=${decision.modelEntry.capabilities.toolCalling}, reasoning=${decision.modelEntry.capabilities.reasoningDepth}\n`);
      } catch (err) {
        console.log(`\nNo suitable model found for role '${role}' with current registry.\n`);
        console.log('Start LM Studio with a compatible model and try again.\n');
      }
    });
}
