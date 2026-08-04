// Quote library shown during rest breaks.
//
// Selection uses a "recently seen" list sized to 60% of the enabled pool, so
// you cycle through most of a category before anything comes back around.

const RAW = {
  funny: [
    ['I love deadlines. I love the whooshing noise they make as they go by.', 'Douglas Adams'],
    ['The trouble with having an open mind is that people keep coming along and sticking things into it.', 'Terry Pratchett'],
    ['I always wanted to be somebody, but now I realise I should have been more specific.', 'Lily Tomlin'],
    ['Never put off till tomorrow what you can do the day after tomorrow.', 'Mark Twain'],
    ['A day without sunshine is like, you know, night.', 'Steve Martin'],
    ['I intend to live forever. So far, so good.', 'Steven Wright'],
    ['Everything is funny, as long as it is happening to somebody else.', 'Will Rogers'],
    ['Age is an issue of mind over matter. If you do not mind, it does not matter.', 'Mark Twain'],
    ['The early bird gets the worm, but the second mouse gets the cheese.', null],
    ['I am not a control freak. I just know exactly how everything should be done.', null],
    ['My desk has two states: chaos, and a slightly different chaos.', null],
    ['Nothing is foolproof to a sufficiently talented fool.', null],
    ['I told my laptop I needed a break. It gave me a blue screen.', null],
    ['There are two hard problems in life: naming things, and everything else.', null],
    ['Experience is the thing you get right after you needed it.', null],
    ['I would agree with you, but then we would both be wrong.', null],
    ['A clean desk is a sign of a cluttered drawer.', null],
    ['Multitasking: the art of doing several things badly at once.', null],
    ['My greatest strength is that I am highly self-aware. My greatest weakness is also that.', null],
    ['If at first you do not succeed, redefine success.', null],
    ['The road to production is paved with temporary fixes.', null],
    ['Some people graduate with honours. I graduated with relief.', null],
    ['Dear inbox, I do not love you back.', null],
    ['I am on a seafood diet. I see food, and I schedule a meeting about it.', null],
    ['Do not worry about the world ending today. It is already tomorrow in Australia.', 'Charles Schulz'],
    ['Behind every great worker is a browser with forty tabs open.', null],
    ['Autocorrect has become my worst enema.', null],
    ['I have not failed. I have found ten thousand ways that generate a ticket.', null],
    ['They say money cannot buy happiness. It can buy a second monitor, which is close.', null],
    ['Weekends do not count unless you spend them doing something completely pointless.', 'Bill Watterson'],
    ['I am at that age where my back goes out more than I do.', null],
    ['The best time to plant a tree was twenty years ago. The second best time is after this meeting.', null],
    ['My calendar is a work of speculative fiction.', null],
    ['A meeting is an event where minutes are kept and hours are lost.', null],
    ['I put the pro in procrastinate. I will finish the joke later.', null],
    ['Silence is golden, unless you have a toddler. Then it is suspicious.', null],
    ['I do not need an alarm clock. My ambition wakes me. Then it goes back to sleep.', null],
    ['If you think nobody cares whether you are alive, try missing a couple of payments.', 'Earl Wilson'],
    ['Half the battle is showing up. The other half is staying awake.', null],
    ['I have decided to be spontaneous. Starting next Tuesday, as planned.', null]
  ],

  interesting: [
    ['The eye focuses by changing shape. Twenty minutes of one distance is twenty minutes of one shape.', null],
    ['Octopuses have three hearts, and two stop beating when they swim.', null],
    ['Honey found in Egyptian tombs was still edible after three thousand years.', null],
    ['A day on Venus is longer than a year on Venus.', null],
    ['Bananas are berries. Strawberries are not.', null],
    ['There are more possible chess games than atoms in the observable universe.', null],
    ['Sharks existed before trees did.', null],
    ['The Eiffel Tower grows about fifteen centimetres taller in summer.', null],
    ['Cleopatra lived closer in time to the Moon landing than to the building of the Great Pyramid.', null],
    ['Wombat droppings are cube-shaped, which stops them rolling away.', null],
    ['Your stomach lining replaces itself every few days, or it would digest itself.', null],
    ['The shortest war in history lasted about thirty-eight minutes.', null],
    ['Trees communicate distress to each other through underground fungal networks.', null],
    ['A single cloud can weigh more than a million kilograms.', null],
    ['Humans share about sixty percent of their DNA with a banana.', null],
    ['Oxford University is older than the Aztec Empire.', null],
    ['Sea otters hold hands while sleeping so they do not drift apart.', null],
    ['The tongue of a blue whale can weigh as much as an elephant.', null],
    ['There is enough gold in the Earth’s core to coat the surface half a metre deep.', null],
    ['Hot water can freeze faster than cold water, and nobody fully agrees why.', null],
    ['Butterflies taste with their feet.', null],
    ['The average cumulus cloud floats despite weighing as much as a hundred elephants.', null],
    ['Norway knighted a penguin. He holds the rank of Major General.', null],
    ['If you could fold a piece of paper forty-two times, it would reach the Moon.', null],
    ['A group of flamingos is called a flamboyance.', null],
    ['Venus rotates backwards compared with almost every other planet.', null],
    ['The Great Wall of China is not visible to the naked eye from space.', null],
    ['Your brain uses about twenty percent of your body’s energy while being two percent of its mass.', null],
    ['Scotland’s national animal is the unicorn.', null],
    ['Bees can recognise individual human faces.', null],
    ['There are more trees on Earth than stars in the Milky Way.', null],
    ['The inventor of the frisbee was turned into a frisbee after he died.', null],
    ['Time passes very slightly faster at your head than at your feet.', null],
    ['A shrimp’s heart is in its head.', null],
    ['Antarctica is the largest desert on Earth.', null],
    ['The dot over a lowercase i is called a tittle.', null],
    ['Pineapples take about two years to grow a single fruit.', null],
    ['Nearly all the mass of an atom is in the nucleus, which is almost all empty space.', null],
    ['Some Greenland sharks alive today were born before the printing press was common.', null],
    ['The smell after rain has a name: petrichor.', null]
  ],

  parenting: [
    ['Your children need your presence more than your presents.', 'Jesse Jackson'],
    ['There is no such thing as a perfect parent. So just be a real one.', 'Sue Atkins'],
    ['Children are not a distraction from more important work. They are the most important work.', 'C. S. Lewis'],
    ['The days are long but the years are short.', 'Gretchen Rubin'],
    ['Kids spell love T-I-M-E.', 'John Crudele'],
    ['If you want your children to turn out well, spend twice as much time with them and half as much money.', 'Abigail Van Buren'],
    ['It is easier to build strong children than to repair broken adults.', 'Frederick Douglass'],
    ['Do not worry that children never listen to you. Worry that they are always watching you.', 'Robert Fulghum'],
    ['A child seldom needs a good talking to as much as a good listening to.', null],
    ['The best inheritance a parent can give a child is a few minutes of their time each day.', null],
    ['Parenting is the only job where the better you do, the less you are needed.', null],
    ['Your calm is the thing they borrow when they have none of their own.', null],
    ['Nobody remembers the tidy house. They remember who read to them.', null],
    ['You are not managing their behaviour. You are teaching them to manage their own.', null],
    ['The small moments are the big moments. You just cannot tell at the time.', null],
    ['They do not need you to be right. They need you to come back after you were wrong.', null],
    ['Attention is the most generous thing you own.', null],
    ['A child who is heard learns to listen.', null],
    ['Every tantrum is a nervous system asking for help, badly.', null],
    ['You cannot pour from an empty cup, and children are excellent at noticing empty cups.', null],
    ['Say sorry to your kids. It teaches them repair is possible.', null],
    ['Being consistent matters more than being clever.', null],
    ['The house will still be untidy tomorrow. They will not still be four.', null],
    ['Do not rush the parts you will miss.', null],
    ['They will forget what you bought. They will remember whether you looked up.', null],
    ['Discipline is teaching, not punishing. The word means to instruct.', null],
    ['Boredom is where children find out who they are.', null],
    ['Sometimes the most useful parenting is to do nothing and stay nearby.', null],
    ['Children learn to regulate by borrowing your regulation first.', null],
    ['You are raising an adult, not managing a child.', null],
    ['The goal is not obedience. The goal is judgement.', null],
    ['A parent’s patience is a renewable resource, but only if you rest it.', null],
    ['They are not giving you a hard time. They are having a hard time.', null],
    ['Show them what repair looks like and they will never fear conflict.', null],
    ['The strongest thing you can model is asking for help.', null],
    ['Play is not a break from learning. It is how learning happens.', null],
    ['You will never regret the time you spent outside with them.', null],
    ['A hard day with your children is still a day with your children.', null],
    ['What they need most is usually cheaper and slower than what you planned.', null],
    ['One day you will pick them up and put them down for the last time, and not know it.', null]
  ],

  product: [
    ['Fall in love with the problem, not the solution.', 'Uri Levine'],
    ['If you are not embarrassed by the first version of your product, you have launched too late.', 'Reid Hoffman'],
    ['Make something people want.', 'Paul Graham'],
    ['Your most unhappy customers are your greatest source of learning.', 'Bill Gates'],
    ['The hardest single part of building a system is deciding what to build.', 'Fred Brooks'],
    ['Innovation is saying no to a thousand things.', 'Steve Jobs'],
    ['A roadmap is a statement of intent, not a promise of dates.', null],
    ['Strategy is choosing what not to do.', 'Michael Porter'],
    ['You cannot interview your way to a strategy, but you cannot build one without interviews either.', null],
    ['Ship to learn, not to finish.', null],
    ['If everything is a priority, nothing is.', null],
    ['The riskiest assumption deserves the cheapest test.', null],
    ['Users do not want a quarter-inch drill. They want a quarter-inch hole.', 'Theodore Levitt'],
    ['Data tells you what happened. Talking to customers tells you why.', null],
    ['Opinions are cheap until they are written down as a bet.', null],
    ['The best feature you shipped this quarter might be the one you deleted.', null],
    ['A backlog is not a plan. It is a pile of unmade decisions.', null],
    ['Vanity metrics feel like progress and cost you a quarter.', null],
    ['If you cannot say who it is not for, you have not defined who it is for.', null],
    ['Discovery is not a phase. It is a habit.', null],
    ['Roadmaps should have themes, not Gantt charts.', null],
    ['You are not behind schedule. You were wrong about the schedule.', null],
    ['Every feature you add is a feature you maintain forever.', null],
    ['Solve the boring problem well before you solve the exciting one badly.', null],
    ['Adoption is a lagging indicator of whether you understood the user.', null],
    ['Say no with a reason and it lands as leadership, not obstruction.', null],
    ['The user did not read your onboarding. Nobody reads your onboarding.', null],
    ['Perfect is the enemy of shipped, and shipped is the enemy of learned nothing.', null],
    ['Build the thing that makes the next thing easier.', null],
    ['A prototype is worth a thousand meetings.', null],
    ['If the metric is easy to move, check whether it is worth moving.', null],
    ['Estimates are a forecast, not a commitment. Treat them that way out loud.', null],
    ['The best product decisions look obvious afterwards and impossible beforehand.', null],
    ['Listen to customers, but do not take dictation.', null],
    ['Your competitors are not the benchmark. Your users’ alternatives are.', null],
    ['Scope creep is usually a symptom of an unclear problem statement.', null],
    ['Write the press release first. If it is boring, so is the feature.', null],
    ['A good PM makes the team faster, not busier.', null],
    ['Technical debt is a loan. Someone always makes the repayments.', null],
    ['Clarity is the highest-leverage thing you can produce.', null]
  ]
};

const QUOTES = [];
for (const [category, items] of Object.entries(RAW)) {
  items.forEach(([text, author], i) => {
    QUOTES.push({ id: `${category}-${i}`, category, text, author });
  });
}

function countByCategory() {
  const out = {};
  for (const q of QUOTES) out[q.category] = (out[q.category] || 0) + 1;
  return out;
}

/**
 * Picks a quote from the enabled categories, avoiding anything shown recently.
 * @param {object} cfg current config
 * @param {(patch: object) => void} persist called with the updated recent list
 */
function pick(cfg, persist) {
  const enabled = QUOTES.filter((q) => cfg.categories && cfg.categories[q.category]);
  const pool = enabled.length ? enabled : QUOTES;

  const recent = new Set(cfg.recentQuotes || []);
  let candidates = pool.filter((q) => !recent.has(q.id));
  if (candidates.length === 0) candidates = pool;

  const chosen = candidates[Math.floor(Math.random() * candidates.length)];

  const memory = Math.max(1, Math.floor(pool.length * 0.6));
  const nextRecent = [chosen.id, ...(cfg.recentQuotes || []).filter((id) => id !== chosen.id)]
    .slice(0, memory);
  if (typeof persist === 'function') persist({ recentQuotes: nextRecent });

  return chosen;
}

module.exports = { pick, QUOTES, countByCategory, total: QUOTES.length };
