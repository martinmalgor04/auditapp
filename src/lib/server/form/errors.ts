export class AuditFormNotAllowedError extends Error {
  readonly code = 'AUDIT_FORM_NOT_ALLOWED';

  constructor(message = 'No tenés permiso para editar esta auditoría') {
    super(message);
    this.name = 'AuditFormNotAllowedError';
  }
}

export class AuditFormNotEditableError extends Error {
  readonly code = 'AUDIT_FORM_NOT_EDITABLE';

  constructor(message = 'La auditoría no admite edición del formulario en este estado') {
    super(message);
    this.name = 'AuditFormNotEditableError';
  }
}

export class FormImportValidationError extends Error {
  readonly code: 'FORM_IMPORT_VALIDATION' | 'FORM_IMPORT_AUDIT_MISMATCH';

  constructor(code: 'FORM_IMPORT_VALIDATION' | 'FORM_IMPORT_AUDIT_MISMATCH', message: string) {
    super(message);
    this.code = code;
    this.name = 'FormImportValidationError';
  }
}

export class FormItemNotAllowedError extends Error {
  readonly code = 'ITEM_NOT_ALLOWED';

  constructor(message = 'Ítem no pertenece a esta auditoría') {
    super(message);
    this.name = 'FormItemNotAllowedError';
  }
}
