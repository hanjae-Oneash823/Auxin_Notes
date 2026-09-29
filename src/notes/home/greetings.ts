/** Home dashboard headline options. `{name}` is replaced with the user's name. */
const STANDARD_GREETINGS = [
  'Welcome back, {name}',
  'Back at it, {name}',
  'Good to see you, {name}',
  'Hello again, {name}',
  'Ready when you are, {name}',
  "Let's get to work, {name}",
  'Nice to have you back, {name}',
  'Time to write, {name}',
  'Hey {name}',
  'Good to have you, {name}',
  'Ready to write, {name}?',
  'Right on time, {name}',
  'Notes await, {name}',
  'Onward, {name}',
  'Glad you\'re here, {name}',
  'Let\'s think, {name}',
];

const WEIRD_GREETINGS = [
  'Oh, it\'s you again, {name}',
  'The notes missed you, {name}',
  '{name} has entered the vault',
  'Bring me your thoughts, {name}',
  'Greetings, human {name}',
  'Ctrl+S your soul, {name}',
  'Sup, {name}',
  'Bonjour, {name}',
  'You\'re late, {name}',
  'Ah, the note goblin returns',
  'Behold, {name}, the vault',
  'Feed the backlinks, {name}',
  'Hello, fellow thinker {name}',
  'The cursor blinks for you, {name}',
  'Words. Go. Now, {name}',
  'Insert thought here, {name}',
  '{name}! The tabs missed you',
  'Your move, {name}',
  'Who needs sleep, {name}',
  'Vault status: open, {name}',
  'The vault has eyes, {name}',
  '{name}. You have been expected.',
  'Your notes formed a union, {name}',
  'Hail the Great Backlink, {name}',
  'Do not feed the tabs, {name}',
  '{name}, the folder tree grew again',
  'Somewhere a raccoon reads your notes',
  'The unresolved links are plotting, {name}',
  'Please remain calm and type, {name}',
  'A wild {name} appears',
  'Tonight we feast on backlinks, {name}',
  'Approach the vault, {name}',
];

const GREETINGS = [...STANDARD_GREETINGS, ...WEIRD_GREETINGS];

/** A random greeting template, still containing `{name}`. */
export function randomGreeting(): string {
  return GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
}

export function fillGreeting(template: string, name: string): string {
  return template.split('{name}').join(name);
}
