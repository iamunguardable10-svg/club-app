/**
 * The demo club's own words (names of halls, teams and groups, notes,
 * reasons, messages) in the app language at the time it is seeded, so the
 * demo reads like a real club in that country. Titles the app stores itself
 * ("Team training", "Game") stay English and are translated on screen
 * (`STORED_TITLES`). Switching the language reseeds the demo (repository).
 */

import type { Locale } from '@/shared/i18n/locales';

export type DemoTexts = {
  halls: { main: string; small: string; gym: string; south: string };
  teams: { u16: string; u18: string; women: string };
  groups: { starters: string; rehab: string };
  meetAway: string;
  meetHome: string;
  noteAway: string;
  noteTraining: string;
  noteMeeting: string;
  reasonSick: string;
  reasonFamily: string;
  reasonBus: string;
  reasonExam: string;
  injuryNote: string;
  holidayNote: string;
  soloRun: string;
  soloShooting: string;
  parentName: string;
  messages: { kit: string; game: string; dinner: string; dinnerOptions: [string, string, string]; general: string; camp: string; volleyball: string; u18: string };
  carpool: { meetPoint: string; note: string };
  reviewNote: string;
};

const EN: DemoTexts = {
  halls: { main: 'North Hall', small: 'Small Hall', gym: 'Weight Room', south: 'South Gym' },
  teams: { u16: 'U16 Boys', u18: 'U18 Girls', women: 'Women 1' },
  groups: { starters: 'Starting Five', rehab: 'Rehab' },
  meetAway: 'Club car park (bus)',
  meetHome: 'Changing room 2',
  noteAway: 'Bring both kits and a packed lunch.',
  noteTraining: 'Indoor shoes. Short video analysis after the session.',
  noteMeeting: 'Season plan and tournament weekend.',
  reasonSick: 'Sick',
  reasonFamily: 'Family event',
  reasonBus: 'Missed the bus',
  reasonExam: 'Exam tomorrow',
  injuryNote: 'Ankle sprain, the physio says about two weeks.',
  holidayNote: 'Family holiday',
  soloRun: 'Run',
  soloShooting: 'Shooting practice',
  parentName: 'Demo parent',
  messages: {
    kit: 'Kit collection on Monday after training. Please bring 20 € for the warm-up shirt.',
    game: 'Game on Saturday: be at the hall by 10:15, warm-up starts 10:30. Bring both kits.',
    dinner: 'Team dinner after the last game: which days work for you?',
    dinnerOptions: ['Friday', 'Saturday', 'Sunday'],
    general: 'General meeting on 12 November at 19:00 in the club house. Everyone is welcome.',
    camp: 'Basketball summer camp: sign-up opens next week. Ask your coach for details.',
    volleyball: 'Volleyball: new training times from next week, Tuesdays now 20:45 in the North Hall.',
    u18: 'Please answer for Sunday by Friday evening, we need to know if we have enough players.',
  },
  carpool: { meetPoint: 'Club car park, Nordring', note: 'Room for one kit bag each.' },
  reviewNote: '90 minutes at RPE 10 – was it really that hard?',
};

const DE: DemoTexts = {
  halls: { main: 'Sporthalle Nord', small: 'Gymnastikhalle', gym: 'Kraftraum', south: 'Turnhalle Süd' },
  teams: { u16: 'U16 Jungen', u18: 'U18 Mädchen', women: 'Damen 1' },
  groups: { starters: 'Starting Five', rehab: 'Reha' },
  meetAway: 'Vereinsparkplatz (Bus)',
  meetHome: 'Kabine 2',
  noteAway: 'Beide Trikots und Verpflegung mitbringen.',
  noteTraining: 'Hallenschuhe. Nach dem Training kurze Videoanalyse.',
  noteMeeting: 'Saisonplanung und Turnierwochenende.',
  reasonSick: 'Krank',
  reasonFamily: 'Familienfeier',
  reasonBus: 'Bus verpasst',
  reasonExam: 'Morgen Klausur',
  injuryNote: 'Bänderdehnung im Knöchel, laut Physio etwa zwei Wochen.',
  holidayNote: 'Familienurlaub',
  soloRun: 'Laufen',
  soloShooting: 'Wurftraining',
  parentName: 'Demo-Elternteil',
  messages: {
    kit: 'Trikotausgabe am Montag nach dem Training. Bitte 20 € für das Aufwärmshirt mitbringen.',
    game: 'Spiel am Samstag: um 10:15 in der Halle, Aufwärmen ab 10:30. Beide Trikots mitbringen.',
    dinner: 'Teamessen nach dem letzten Spiel: Welche Tage passen euch?',
    dinnerOptions: ['Freitag', 'Samstag', 'Sonntag'],
    general: 'Mitgliederversammlung am 12. November um 19:00 im Vereinsheim. Alle sind willkommen.',
    camp: 'Basketball-Sommercamp: Anmeldung ab nächster Woche. Fragt eure Trainer.',
    volleyball: 'Volleyball: ab nächster Woche neue Trainingszeiten, dienstags jetzt 20:45 in der Sporthalle Nord.',
    u18: 'Bitte bis Freitagabend für Sonntag zu- oder absagen, wir müssen wissen, ob wir genug sind.',
  },
  carpool: { meetPoint: 'Vereinsparkplatz, Nordring', note: 'Platz für je eine Sporttasche.' },
  reviewNote: '90 Minuten mit RPE 10 – war es wirklich so hart?',
};

const FR: DemoTexts = {
  halls: { main: 'Salle Nord', small: 'Petite salle', gym: 'Salle de musculation', south: 'Gymnase Sud' },
  teams: { u16: 'U16 garçons', u18: 'U18 filles', women: 'Seniors F1' },
  groups: { starters: 'Cinq de départ', rehab: 'Rééducation' },
  meetAway: 'Parking du club (bus)',
  meetHome: 'Vestiaire 2',
  noteAway: 'Apportez les deux maillots et un repas.',
  noteTraining: 'Chaussures de salle. Courte analyse vidéo après la séance.',
  noteMeeting: 'Planning de la saison et week-end de tournoi.',
  reasonSick: 'Malade',
  reasonFamily: 'Fête de famille',
  reasonBus: 'Bus raté',
  reasonExam: 'Examen demain',
  injuryNote: 'Entorse de la cheville, environ deux semaines selon le kiné.',
  holidayNote: 'Vacances en famille',
  soloRun: 'Course',
  soloShooting: 'Entraînement au tir',
  parentName: 'Parent démo',
  messages: {
    kit: 'Remise des maillots lundi après l’entraînement. Apportez 20 € pour le t-shirt d’échauffement.',
    game: 'Match samedi : à la salle à 10:15, échauffement à 10:30. Apportez les deux maillots.',
    dinner: 'Dîner d’équipe après le dernier match : quels jours vous conviennent ?',
    dinnerOptions: ['Vendredi', 'Samedi', 'Dimanche'],
    general: 'Assemblée générale le 12 novembre à 19:00 au club-house. Tout le monde est le bienvenu.',
    camp: 'Stage d’été de basket : inscriptions la semaine prochaine. Demandez à votre coach.',
    volleyball: 'Volley : nouveaux horaires dès la semaine prochaine, le mardi à 20:45 à la salle Nord.',
    u18: 'Répondez pour dimanche avant vendredi soir, nous devons savoir si nous sommes assez.',
  },
  carpool: { meetPoint: 'Parking du club, Nordring', note: 'Place pour un sac chacun.' },
  reviewNote: '90 minutes à RPE 10 – était-ce vraiment si dur ?',
};

const ES: DemoTexts = {
  halls: { main: 'Pabellón Norte', small: 'Sala pequeña', gym: 'Sala de pesas', south: 'Gimnasio Sur' },
  teams: { u16: 'U16 chicos', u18: 'U18 chicas', women: 'Femenino 1' },
  groups: { starters: 'Quinteto inicial', rehab: 'Rehabilitación' },
  meetAway: 'Aparcamiento del club (autobús)',
  meetHome: 'Vestuario 2',
  noteAway: 'Traed las dos equipaciones y comida.',
  noteTraining: 'Zapatillas de interior. Breve análisis de vídeo después.',
  noteMeeting: 'Planificación de la temporada y fin de semana de torneo.',
  reasonSick: 'Enfermo',
  reasonFamily: 'Celebración familiar',
  reasonBus: 'Perdí el autobús',
  reasonExam: 'Examen mañana',
  injuryNote: 'Esguince de tobillo, unas dos semanas según el fisio.',
  holidayNote: 'Vacaciones en familia',
  soloRun: 'Carrera',
  soloShooting: 'Práctica de tiro',
  parentName: 'Madre/padre demo',
  messages: {
    kit: 'Entrega de equipaciones el lunes después del entrenamiento. Traed 20 € para la camiseta de calentamiento.',
    game: 'Partido el sábado: en el pabellón a las 10:15, calentamiento a las 10:30. Traed las dos equipaciones.',
    dinner: 'Cena de equipo tras el último partido: ¿qué días os vienen bien?',
    dinnerOptions: ['Viernes', 'Sábado', 'Domingo'],
    general: 'Asamblea general el 12 de noviembre a las 19:00 en la sede del club. Todos sois bienvenidos.',
    camp: 'Campus de verano de baloncesto: inscripción la semana que viene. Preguntad a vuestro entrenador.',
    volleyball: 'Voleibol: nuevos horarios desde la semana que viene, los martes a las 20:45 en el Pabellón Norte.',
    u18: 'Responded para el domingo antes del viernes por la noche, necesitamos saber si somos suficientes.',
  },
  carpool: { meetPoint: 'Aparcamiento del club, Nordring', note: 'Sitio para una bolsa cada uno.' },
  reviewNote: '90 minutos con RPE 10: ¿de verdad fue tan duro?',
};

export const DEMO_TEXTS: Record<Locale, DemoTexts> = { en: EN, de: DE, fr: FR, es: ES };
