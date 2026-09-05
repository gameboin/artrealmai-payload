import { Users } from './Users'
import { Media } from './Media'
import { Files } from './Files'
import { Articles } from './Articles'
import { Tags } from './Tags'
import { Authors } from './Authors'
import { GlossaryTerms } from './GlossaryTerms'
import { PromptStyles } from './PromptStyles'
import { SavedPrompts } from './SavedPrompts'
import { SavedLogos } from './SavedLogos'
// 1. Import the new Contact Submissions collection
import { ContactSubmissions } from './ContactSubmissions'
import { Generations } from './Generations'
import { GenPurchases } from './GenPurchases'

export const collections = [
  Users,
  Media,
  Files,
  Generations,
  GenPurchases,
  Articles,
  Tags,
  Authors,
  GlossaryTerms,
  PromptStyles,
  SavedPrompts,
  SavedLogos,
  // 2. Register the collection in the export array
  ContactSubmissions,
]