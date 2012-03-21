package util;

import java.lang.reflect.Field;

import model.ClassModel;
import redis.clients.jedis.Jedis;

public class Utils {
	public static final String[] TERMS = { "SP", "SU", "FL" };
	public static final String[] TERMS_STRINGS = { "spring", "summer", "fall" };

	public static String trim(String text) {
		int start = text.length(), end = text.length();
		for (int i = 0; i < text.length(); i++) {
			char c = text.charAt(i);
			if (c >= '!' && c <= '~') {
				start = i;
				break;
			}
		}

		for (int i = text.length() - 1; i >= 0; i--) {
			char c = text.charAt(i);
			if (c >= '!' && c <= '~') {
				end = i + 1;
				break;
			}
		}

		if (start >= text.length() || start >= end) {
			return "";
		} else {
			return text.substring(start, end);
		}
	}

	private static final String REDIS_URL = "localhost";
	private static Jedis jedis = new Jedis(REDIS_URL);

	public static void save(ClassModel m) {
		for (String day : m.days.split("(?=\\p{Upper})")) {
			String id = getNextClassId();

			{ // classtimes
				String key = String.format("room:%s%s:%s:%s", m.buildingNumber,
						m.building, day, m.term).replace(" ", "");
				String field = m.time.replace(" ", "");

				jedis.hset(key, field, id);
			}

			{ // classes
				try {
					for (Field field : ClassModel.class.getFields()) {
						String key = String.format("class:%s:%s", id,
								field.getName());
						String value = (String) field.get(m);
						
						jedis.set(key, value);
					}
				} catch (IllegalArgumentException e) {
					e.printStackTrace();
				} catch (IllegalAccessException e) {
					e.printStackTrace();
				}
			}
		}
	}

	public static String getNextClassId() {
		jedis.setnx("next.class.id", "0");
		Long id = jedis.incr("next.class.id");
		return id.toString();
	}
}
