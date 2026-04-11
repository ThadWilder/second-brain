'use client'

import { CollapsibleSection } from './CollapsibleSection'
import { EntityCards } from './EntityCards'
import type { EntityCardData, EntityRelationship } from './EntityCards'
import type { Entity } from '@/types'

interface Props {
  contacts: EntityCardData[]
  vendorTeam: EntityCardData[]
  freelancers: EntityCardData[]
  allEntities?: Entity[]
  entityRelationships?: EntityRelationship[]
  onRefresh?: () => void
}

export function PeopleSection({ contacts, vendorTeam, freelancers, allEntities, entityRelationships, onRefresh }: Props) {
  const totalCount = contacts.length + vendorTeam.length + freelancers.length

  if (totalCount === 0) return null

  return (
    <CollapsibleSection
      title="People"
      icon="👥"
      count={totalCount}
      defaultExpanded={false}
    >
      <div className="space-y-7">
        {contacts.length > 0 && (
          <EntityCards
            title="Team Members"
            entities={contacts}
            type="contact"
            allEntities={allEntities}
            entityRelationships={entityRelationships}
            onRefresh={onRefresh}
          />
        )}
        {vendorTeam.length > 0 && (
          <EntityCards
            title="Vendor Team"
            entities={vendorTeam}
            type="vendor_team"
            allEntities={allEntities}
          />
        )}
        {freelancers.length > 0 && (
          <EntityCards
            title="Freelancers"
            entities={freelancers}
            type="freelancer"
            allEntities={allEntities}
          />
        )}
      </div>
    </CollapsibleSection>
  )
}
