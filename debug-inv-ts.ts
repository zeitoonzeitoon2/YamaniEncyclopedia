
import { prisma } from './lib/prisma';

async function main() {
  const d = await prisma.domain.findFirst({
    where: { name: 'علوم اجتماعی' }
  });
  
  if (!d) {
    console.log('Domain not found');
    return;
  }
  
  console.log('Domain found:', d.id, d.name);
  
  const invs = await prisma.domainInvestment.findMany({
    where: { targetDomainId: d.id }
  });
  
  console.log('Investments found:', invs.length);
  invs.forEach(inv => {
    console.log(`Investment: Proposer=${inv.proposerDomainId} (${inv.proposerWing}), Target=${inv.targetDomainId} (${inv.targetWing}), Invested=${inv.percentageInvested}, Return=${inv.percentageReturn}, Status=${inv.status}`);
  });

  // Also check if there are any voting shares
  const shares = await prisma.domainVotingShare.findMany({
    where: { domainId: d.id }
  });
  console.log('Explicit shares:', shares);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    // await prisma.$disconnect();
  });
