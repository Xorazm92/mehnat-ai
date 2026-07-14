export enum UserRole {
  ADMIN = 'ADMIN', // System administrator (bot owner)
  SUPERVISOR = 'SUPERVISOR', // Бош ҳисобчи (chief accountant) — top of staff hierarchy
  CONTROLLER = 'CONTROLLER', // Назоратчи (controller) — oversees a firm's group
  ACCOUNTANT = 'ACCOUNTANT', // Бухгалтер (accountant)
  BANK_CLIENT = 'BANK_CLIENT', // Банк клиент (bank operations)
  CLIENT = 'CLIENT', // Мижоз (firm/customer contact)
  BOT = 'BOT', // The bot itself (system messages)
}
