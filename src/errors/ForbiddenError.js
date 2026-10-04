import { AppError } from './AppError.js';

export class ForbiddenError extends AppError {
    constructor(message = 'Недостаточно прав для этой операции', code = 'FORBIDDEN') {
        super(message, { status: 403, code });
    }
}