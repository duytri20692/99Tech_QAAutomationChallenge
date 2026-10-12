/** User-facing messages produced by DemoBlaze (browser alerts and API errors). */
export const Messages = {
  login: {
    wrongPassword: 'Wrong password.',
    userDoesNotExist: 'User does not exist.',
    fillOutCredentials: 'Please fill out Username and Password.',
  },
  signUp: {
    userAlreadyExists: 'This user already exist.',
  },
  cart: {
    productAdded: /Product added/i,
  },
  order: {
    fillOutNameAndCard: 'Please fill out Name and Creditcard.',
    thankYou: 'Thank you for your purchase!',
  },
} as const;
