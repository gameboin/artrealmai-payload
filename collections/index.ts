import { Users } from './Users'
import { Media } from './Media'
import { Articles } from './Articles'
import { Tags } from './Tags'
import { Authors } from './Authors'
import { GlossaryTerms } from './GlossaryTerms'
import { PromptStyles } from './PromptStyles'
import { SavedPrompts } from './SavedPrompts'
// 1. Import the new Contact Submissions collection
import { ContactSubmissions } from './ContactSubmissions'

export const collections = [
  Users,
  Media,
  Articles,
  Tags,
  Authors,
  GlossaryTerms,
  PromptStyles,
  SavedPrompts,
  // 2. Register the collection in the export array
  ContactSubmissions,
]