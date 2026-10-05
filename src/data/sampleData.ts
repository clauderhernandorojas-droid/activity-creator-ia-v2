import type { Lesson, ExtractedBlock } from '../types/schema';

export const initialLesson: Lesson = {
  id: 'lesson-elt-unit-4',
  title: 'English File Intermediate - Unit 4: Communication & Grammar',
  level: 'B1',
  unit: 'Unit 4B',
  slides: [
    {
      id: 'slide-1',
      title: 'Subject & Object Questions: Who called Mick?',
      subtitle: 'Analyze the police investigation notes and form the correct question structures',
      layout: 'split_50_50',
      referenceContent: {
        type: 'table_reference',
        id: 'ref-table-subject-questions',
        title: 'Grammar Focus: Subject vs. Object Questions',
        headers: ['Question Word', 'Auxiliary', 'Subject', 'Main Verb', 'Rest / Context', 'Question Type'],
        rows: [
          ['Who', '—', '—', 'called', 'Mick Benton?', 'Subject (Who did the action?)'],
          ['Who', 'did', 'Mick', 'call', 'last night?', 'Object (Whom did Mick call?)'],
          ['What', '—', '—', 'happened', 'at Andrea\'s office?', 'Subject (No auxiliary "did")'],
          ['What', 'did', 'Andrea', 'say', 'to the detective?', 'Object (Auxiliary "did" + base form)']
        ],
        caption: 'Rule: When "Who" or "What" is the subject of the question, DO NOT use do/does/did. The verb is in the normal past or present form.'
      },
      interaction: {
        type: 'input_fields',
        id: 'inter-subject-questions',
        instruction: 'Complete the detective\'s interview questions. Write the missing question using the words in brackets:',
        layoutMode: 'list',
        listItems: [
          {
            id: 'inp-1',
            prompt: 'Someone stole the confidential files yesterday. (Who / steal / the files?)',
            prefix: 'Q: ',
            acceptedAnswers: ['Who stole the files?', 'Who stole the files', 'who stole the files'],
            hint: 'Remember: This is a subject question. Do not use "did"!'
          },
          {
            id: 'inp-2',
            prompt: 'Andrea called someone before leaving the building. (Who / Andrea / call?)',
            prefix: 'Q: ',
            acceptedAnswers: ['Who did Andrea call?', 'Who did Andrea call', 'who did andrea call'],
            hint: 'This is an object question. Use "did" + base form.'
          },
          {
            id: 'inp-3',
            prompt: 'Something woke Mick Benton up at 3:00 AM. (What / wake / Mick up?)',
            prefix: 'Q: ',
            acceptedAnswers: ['What woke Mick up?', 'What woke Mick up', 'What woke up Mick?', 'what woke mick up'],
            hint: 'Subject question: Past simple form of "wake" is "woke".'
          },
          {
            id: 'inp-4',
            prompt: 'The detective found something in the drawer. (What / the detective / find?)',
            prefix: 'Q: ',
            acceptedAnswers: ['What did the detective find?', 'What did the detective find', 'what did the detective find'],
            hint: 'Object question with "did" + "find".'
          }
        ],
        tableHeaders: [],
        tableRows: [],
        paragraphTemplate: '',
        paragraphInputs: {}
      },
      notes: 'Warm-up: Ask students who the suspect might be before unveiling the grammar rules.'
    },
    {
      id: 'slide-2',
      title: 'Dependent Prepositions: Verbs with FOR, IN, TO, WITH',
      subtitle: 'Classify the English verbs according to their required preposition',
      layout: 'split_50_50',
      referenceContent: {
        type: 'text',
        id: 'ref-text-prepositions',
        title: 'Reading Extract: The Corporate Merger',
        category: 'reading',
        content: `At the annual conference, the CEO apologized for the unforeseen delay. She applied for an emergency grant and succeeded in securing funding. All department heads agreed with the decision and are encouraged to participate in the upcoming restructuring seminars. Remember: verbs in English often link naturally to specific prepositions that cannot be translated word-for-word.`
      },
      interaction: {
        type: 'buckets_matching',
        id: 'inter-prepositions-buckets',
        instruction: 'Drag each verb token into its correct preposition category:',
        buckets: [
          { id: 'b-for', label: 'FOR', description: 'apologize __, apply __', color: '#3b82f6' },
          { id: 'b-in', label: 'IN', description: 'succeed __, participate __', color: '#10b981' },
          { id: 'b-to', label: 'TO', description: 'belong __, listen __', color: '#8b5cf6' },
          { id: 'b-with', label: 'WITH', description: 'agree __, deal __', color: '#f59e0b' }
        ],
        tokens: [
          { id: 'tok-1', text: 'apply', correctBucketId: 'b-for', hint: 'apply ___ a job' },
          { id: 'tok-2', text: 'succeed', correctBucketId: 'b-in', hint: 'succeed ___ passing the exam' },
          { id: 'tok-3', text: 'belong', correctBucketId: 'b-to', hint: 'does this pen belong ___ you?' },
          { id: 'tok-4', text: 'apologize', correctBucketId: 'b-for', hint: 'apologize ___ being late' },
          { id: 'tok-5', text: 'participate', correctBucketId: 'b-in', hint: 'participate ___ the workshop' },
          { id: 'tok-6', text: 'agree', correctBucketId: 'b-with', hint: 'I agree ___ your opinion' },
          { id: 'tok-7', text: 'listen', correctBucketId: 'b-to', hint: 'listen ___ the audio recording' },
          { id: 'tok-8', text: 'deal', correctBucketId: 'b-with', hint: 'how to deal ___ difficult clients' }
        ]
      },
      notes: 'Emphasize that the preposition is followed by a noun or a verb+ing (gerund).'
    },
    {
      id: 'slide-3',
      title: 'Business English: Arranging a Client Meeting',
      subtitle: 'Order the conversation between Rachel and David logically',
      layout: 'split_50_50',
      referenceContent: {
        type: 'media',
        id: 'ref-media-audio',
        mediaType: 'audio',
        url: 'https://actions.google.com/sounds/v1/ambiences/office_murmur.ogg',
        title: 'Listening Track 4.2: Telephone Inquiries',
        transcript: 'Speaker A: David speaking.\nSpeaker B: Hi David, it\'s Rachel from Acro Corp...\nContext: Formal telephone etiquette for scheduling appointments.'
      },
      interaction: {
        type: 'sequence',
        id: 'inter-sequence-meeting',
        instruction: 'Reorder the dialogue turns into the standard business telephone sequence (1 to 5):',
        items: [
          {
            id: 'seq-1',
            text: 'Hello, David speaking. How can I help you today?',
            correctOrder: 1,
            speaker: 'David (Host)'
          },
          {
            id: 'seq-2',
            text: 'Hi David, it\'s Rachel from Acro Corp. I\'m calling to arrange a quick progress meeting.',
            correctOrder: 2,
            speaker: 'Rachel (Client)'
          },
          {
            id: 'seq-3',
            text: 'Certainly Rachel! Would next Tuesday morning suit you around 10:00 AM?',
            correctOrder: 3,
            speaker: 'David (Host)'
          },
          {
            id: 'seq-4',
            text: 'Tuesday at 10:00 AM works great for me. Shall we meet at your downtown office?',
            correctOrder: 4,
            speaker: 'Rachel (Client)'
          },
          {
            id: 'seq-5',
            text: 'Perfect. I will send an electronic invite with the meeting room details right away.',
            correctOrder: 5,
            speaker: 'David (Host)'
          }
        ]
      },
      notes: 'Review polite expressions: "Would ... suit you?", "Shall we say...?"'
    },
    {
      id: 'slide-4',
      title: 'Grammar Accuracy: Present Perfect vs. Past Simple',
      subtitle: 'Choose the correct form based on time anchors and life experiences',
      layout: 'header_stacked',
      referenceContent: {
        type: 'text',
        id: 'ref-text-grammar-tenses',
        title: 'Grammar Note: Finished Time vs. Unfinished Time',
        category: 'grammar_note',
        content: `• Use the PAST SIMPLE for actions completed in a specific finished time period (e.g. yesterday, last year, in 2018, when I was young).\n• Use the PRESENT PERFECT (have/has + past participle) for life experiences without a specific time, or with time expressions that are not finished yet (e.g. today, this week, already, never, so far).`
      },
      interaction: {
        type: 'selection',
        id: 'inter-selection-tenses',
        instruction: 'Select the grammatically correct option for each sentence:',
        questions: [
          {
            id: 'q-1',
            prompt: '1. Mick Benton _______ to three different international conferences so far this year.',
            mode: 'single_choice',
            options: [
              { id: 'opt-1a', text: 'has been', isCorrect: true, feedback: 'Correct! "So far this year" denotes an unfinished time period.' },
              { id: 'opt-1b', text: 'went', isCorrect: false, feedback: 'Incorrect. "Went" requires a finished past time anchor (e.g., last year).' },
              { id: 'opt-1c', text: 'was going', isCorrect: false, feedback: 'Incorrect. Past continuous is used for actions in progress.' }
            ]
          },
          {
            id: 'q-2',
            prompt: '2. Andrea Price _______ her detective agency back in 2019.',
            mode: 'single_choice',
            options: [
              { id: 'opt-2a', text: 'has founded', isCorrect: false, feedback: 'Incorrect. "In 2019" is a finished specific date, so use Past Simple.' },
              { id: 'opt-2b', text: 'founded', isCorrect: true, feedback: 'Correct! Past Simple is obligatory with specific past dates.' },
              { id: 'opt-2c', text: 'was founded', isCorrect: false, feedback: 'Incorrect. Andrea is the subject performing the action (active voice).' }
            ]
          },
          {
            id: 'q-3',
            prompt: '3. Which of the following time markers require the Present Perfect? (Select ALL that apply)',
            mode: 'multiple_choice',
            options: [
              { id: 'opt-3a', text: 'already / yet', isCorrect: true },
              { id: 'opt-3b', text: 'yesterday afternoon', isCorrect: false },
              { id: 'opt-3c', text: 'never / ever in my life', isCorrect: true },
              { id: 'opt-3d', text: 'two weeks ago', isCorrect: false }
            ]
          }
        ]
      },
      notes: 'Give immediate feedback on why the time markers dictate the auxiliary usage.'
    }
  ]
};

// MOCK OCR EXTRACTED TEXTBOOK CLIPPINGS FOR STEP 1 -> STEP 2 WORKFLOW
export const sampleExtractedBlocks: ExtractedBlock[] = [
  {
    id: 'ext-block-1',
    rawText: `Grammar Bank 4B: Subject Questions
Table:
Question Word | Auxiliary | Subject | Verb | Object
Who | — | — | called | Mick?
Who | did | Andrea | meet | at the cafe?
What | — | — | caused | the power outage?
What | did | they | investigate | yesterday?`,
    detectedType: 'table',
    confidence: 0.98,
    parsedData: {
      title: 'Grammar Bank 4B: Subject Questions Table',
      headers: ['Question Word', 'Auxiliary', 'Subject', 'Verb', 'Object'],
      rows: [
        ['Who', '—', '—', 'called', 'Mick?'],
        ['Who', 'did', 'Andrea', 'meet', 'at the cafe?'],
        ['What', '—', '—', 'caused', 'the power outage?'],
        ['What', 'did', 'they', 'investigate', 'yesterday?']
      ]
    }
  },
  {
    id: 'ext-block-2',
    rawText: `Exercise 3: Dependent Prepositions
Categorize the verbs under the right preposition:
- belong (to)
- apologize (for)
- participate (in)
- agree (with)
- apply (for)
- succeed (in)`,
    detectedType: 'vocabulary',
    confidence: 0.94,
    parsedData: {
      title: 'Exercise 3: Dependent Prepositions',
      suggestedBuckets: ['FOR', 'IN', 'TO', 'WITH'],
      tokens: [
        { text: 'belong', target: 'TO' },
        { text: 'apologize', target: 'FOR' },
        { text: 'participate', target: 'IN' },
        { text: 'agree', target: 'WITH' },
        { text: 'apply', target: 'FOR' },
        { text: 'succeed', target: 'IN' }
      ]
    }
  },
  {
    id: 'ext-block-3',
    rawText: `Section B: Put the conversation in order:
a) Hi David, it's Rachel from Acro Corp.
b) Would next Tuesday morning suit you?
c) Hello, David speaking. How can I help you?
d) Perfect. I'll send an invite with details.
e) Tuesday works great for me.`,
    detectedType: 'numbered_list',
    confidence: 0.95,
    parsedData: {
      title: 'Conversation Reordering',
      items: [
        { text: "Hello, David speaking. How can I help you?", order: 1 },
        { text: "Hi David, it's Rachel from Acro Corp.", order: 2 },
        { text: "Would next Tuesday morning suit you?", order: 3 },
        { text: "Tuesday works great for me.", order: 4 },
        { text: "Perfect. I'll send an invite with details.", order: 5 }
      ]
    }
  },
  {
    id: 'ext-block-4',
    rawText: `Reading Section: Travel and Technology
Last year, more than 40 million travelers used mobile boarding passes. Airlines have reported a 35% reduction in check-in queues since adopting biometric facial recognition at international departure gates. Passengers surveyed stated that self-service kiosks made the airport journey much less stressful.`,
    detectedType: 'paragraph',
    confidence: 0.99,
    parsedData: {
      title: 'Reading Passage: Travel and Technology',
      content: 'Last year, more than 40 million travelers used mobile boarding passes. Airlines have reported a 35% reduction in check-in queues since adopting biometric facial recognition at international departure gates. Passengers surveyed stated that self-service kiosks made the airport journey much less stressful.'
    }
  }
];
