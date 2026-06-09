export class BriefingUnavailableError extends Error {
  readonly code = 'BRIEFING_UNAVAILABLE';

  constructor(message = 'Este enlace ya no está disponible') {
    super(message);
    this.name = 'BriefingUnavailableError';
  }
}

export class BriefingItemNotAllowedError extends Error {
  readonly code = 'BRIEFING_ITEM_NOT_ALLOWED';

  constructor(message = 'Ítem no permitido en briefing') {
    super(message);
    this.name = 'BriefingItemNotAllowedError';
  }
}
