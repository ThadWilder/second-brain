import { useState } from 'react';
import {
  View, Text, TouchableOpacity, Image, StyleSheet,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, radius } from '@/lib/theme';
import type { JobMedia } from '@/lib/types';

interface Props {
  jobId: string;
  phase: JobMedia['phase'];
  existing: JobMedia[];
  onUploaded: (media: JobMedia) => void;
  disabled?: boolean;
}

const PHASE_LABELS: Record<JobMedia['phase'], string> = {
  before: 'Before',
  during: 'During',
  after: 'After',
};

export default function PhotoUpload({ jobId, phase, existing, onUploaded, disabled }: Props) {
  const [uploading, setUploading] = useState(false);

  async function pickAndUpload(source: 'camera' | 'library') {
    const picker = source === 'camera'
      ? ImagePicker.launchCameraAsync
      : ImagePicker.launchImageLibraryAsync;

    const result = await picker({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: false,
    });

    if (result.canceled) return;

    setUploading(true);
    try {
      const asset = result.assets[0];
      const { data: { user } } = await supabase.auth.getUser();
      const ext = asset.uri.split('.').pop() ?? 'jpg';
      const path = `${user!.id}/${jobId}/${phase}/${Date.now()}.${ext}`;

      // Read as base64 for upload
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const { error: uploadError } = await supabase.storage
        .from('job-media')
        .upload(path, decode(base64), { contentType: `image/${ext}` });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('job-media')
        .getPublicUrl(path);

      const { data: media, error: dbError } = await supabase
        .from('job_media')
        .insert({
          job_id: jobId,
          uploaded_by: user!.id,
          phase,
          url: publicUrl,
        })
        .select()
        .single();

      if (dbError) throw dbError;
      onUploaded(media as JobMedia);
    } catch (err) {
      Alert.alert('Upload failed', (err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function promptSource() {
    Alert.alert(`Add ${PHASE_LABELS[phase]} Photo`, undefined, [
      { text: 'Camera', onPress: () => pickAndUpload('camera') },
      { text: 'Photo Library', onPress: () => pickAndUpload('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>{PHASE_LABELS[phase]} Photos</Text>
        <Text style={styles.count}>{existing.length} photo{existing.length !== 1 ? 's' : ''}</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
        <View style={styles.photoRow}>
          {existing.map((m) => (
            <Image key={m.id} source={{ uri: m.url }} style={styles.thumb} />
          ))}

          {!disabled && (
            <TouchableOpacity style={styles.addButton} onPress={promptSource} disabled={uploading}>
              {uploading
                ? <ActivityIndicator color={colors.primary} />
                : <Text style={styles.addIcon}>+</Text>}
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {!disabled && existing.length === 0 && (
        <Text style={styles.hint}>
          {phase === 'before' ? 'Required before starting work.' :
           phase === 'after' ? 'Required before marking job complete.' :
           'Optional progress photos.'}
        </Text>
      )}
    </View>
  );
}

// Decode base64 string to Uint8Array for Supabase storage upload
function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  count: { fontSize: fontSize.xs, color: colors.textMuted },
  scroll: { marginHorizontal: -spacing.md },
  photoRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  thumb: { width: 80, height: 80, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  addButton: {
    width: 80, height: 80, borderRadius: radius.sm,
    borderWidth: 2, borderColor: colors.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  addIcon: { fontSize: 28, color: colors.textLight },
  hint: { fontSize: fontSize.xs, color: colors.textMuted, fontStyle: 'italic' },
});
