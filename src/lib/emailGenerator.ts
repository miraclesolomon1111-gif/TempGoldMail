// Generates email addresses strictly under goldmailer.xyz
export const PRIMARY_DOMAIN = 'goldmailer.xyz';

const NAMES = [
  'miracle', 'ella', 'john', 'alex', 'sarah', 'david', 'emma', 'oliver',
  'sophia', 'lucas', 'chloe', 'liam', 'maya', 'noah', 'ava', 'ethan',
  'isla', 'leo', 'zoe', 'mason', 'clara', 'james', 'lily', 'henry',
  'gold', 'temp', 'speedy', 'shield', 'ghost', 'nexus', 'alpha', 'cyber',
  'safe', 'quick', 'pulse', 'spark', 'shadow', 'zen', 'flash', 'prime'
];

export function generateRandomEmail(): string {
  const name = NAMES[Math.floor(Math.random() * NAMES.length)];
  const numberType = Math.random();
  let num = '';
  if (numberType < 0.3) {
    num = Math.floor(Math.random() * 9 + 1).toString();
  } else if (numberType < 0.7) {
    num = Math.floor(Math.random() * 90 + 10).toString();
  } else {
    num = (Math.floor(Math.random() * 8000) + 1000).toString();
  }
  return `${name}${num}@${PRIMARY_DOMAIN}`;
}

export function validateEmailAddress(email: string): boolean {
  if (!email) return false;
  const clean = email.toLowerCase().trim();
  const regex = /^[a-z0-9._%+-]+@([a-z0-9.-]+\.[a-z]{2,})$/;
  return regex.test(clean);
}

export function formatCustomEmail(prefix: string): string {
  const cleanPrefix = prefix
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 30);
  return `${cleanPrefix || 'user'}@${PRIMARY_DOMAIN}`;
}

export const COUNTRIES_LIST = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria",
  "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan",
  "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cabo Verde", "Cambodia",
  "Cameroon", "Canada", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo (Congo-Brazzaville)", "Costa Rica",
  "Croatia", "Cuba", "Cyprus", "Czechia", "Democratic Republic of the Congo", "Denmark", "Djibouti", "Dominica", "Dominican Republic", "Ecuador",
  "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland", "France",
  "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau",
  "Guyana", "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland",
  "Israel", "Italy", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Kuwait", "Kyrgyzstan",
  "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg", "Madagascar",
  "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia",
  "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru", "Nepal",
  "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Korea", "North Macedonia", "Norway", "Oman", "Pakistan",
  "Palau", "Palestine State", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar",
  "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino", "Sao Tome and Principe", "Saudi Arabia",
  "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa",
  "South Korea", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria", "Tajikistan",
  "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu",
  "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States of America", "Uruguay", "Uzbekistan", "Vanuatu", "Vatican City", "Venezuela",
  "Vietnam", "Yemen", "Zambia", "Zimbabwe"
];
